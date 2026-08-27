// lib/bandeja.js — las reglas de "por cuál número va esta conversación".
//
// ⚠️ LA REGLA QUE ESTE ARCHIVO EXISTE PARA SOSTENER:
//
//     La ventana de 24 h de WhatsApp es por par (cliente ↔ número NUESTRO).
//     NO por cliente.
//
// `inbox.conversaciones` tiene UNA fila por persona: ahí viven su nombre, su
// temperatura, sus notas y su venta, y está bien que sea una sola porque el lead
// es el mismo escriba por donde escriba. Lo que NO puede vivir ahí es "¿le
// contesté?" y "¿está abierta la ventana?": esas dos preguntas tienen una
// respuesta distinta por cada número.
//
// Lo que costó no tenerlo en IND (medido el 26-ago-2026, del 22 al 26 de agosto):
//   · 209 mensajes a 26 clientes rechazados por Meta con 131047, dados por
//     enviados en el inbox. A uno solo le fallaron 25 seguidos.
//   · 209 de 209 salieron por un número al que ese cliente NUNCA escribió, y los
//     209 tenían la ventana abierta en el OTRO, a 18 minutos de promedio.
//   · Se parte en dos causas: 130 por la bola de nieve del saliente (abajo), y 79
//     porque el envío tomó el canal de la PESTAÑA en vez de la conversación.
//
// MANDI vivió lo mismo el 19-ago (9 mensajes) y lo arregló así. IND se quedó con
// el código viejo cinco semanas más. Este archivo es el port, con una pieza extra
// que MANDI todavía no tiene: `reabrePorEntregaFallida`.
//
// El archivo es puro a propósito (no habla con Supabase): así la regla se puede
// probar sin base de datos, que es justo lo que faltaba — IND tenía 22 archivos
// de prueba y NI UNO cubría multi-número. Por eso esta familia llegó a producción
// cuatro veces, y dos de esas las introdujo un arreglo.
//
// ⚠️ NO agregar acá una función que lea la tabla `bandeja` entera. Se hizo en
// MANDI el 19-ago y degradó el inbox: +142 kB y 6 viajes de red por ciclo de
// polling, en la ruta que ya es el 47 % del consumo de Vercel.

/** Ventana de servicio de WhatsApp: 24 h desde el último mensaje DEL CLIENTE. */
export const VENTANA_MS = 24 * 60 * 60 * 1000

/**
 * Por cuál número sale lo que se está enviando.
 *
 * Manda la CONVERSACIÓN, no la pestaña. Esa es toda la regla, y es lo que permite
 * trabajar como se trabaja de verdad:
 *
 *   "en general respondo y solo cambia el número"
 *
 * Los 79 mensajes muertos entran por acá: CONTACTOS lee `/api/directorio`, que no
 * está filtrado por número —es la AGENDA, no los mensajes—, y manda con el canal
 * de la pestaña en la que quedó parado el vendedor.
 *
 * NUNCA devuelve vacío por su cuenta: un `Canal` vacío cae al número principal en
 * silencio (ver `canalDe` en /api/saliente), que es exactamente cómo mueren los
 * mensajes. Quien llame tiene que pasar `porDefecto`.
 */
export function canalDeEnvio({ conversacion, pestana, porDefecto } = {}) {
  return String(conversacion || pestana || porDefecto || '')
}

/**
 * ¿Se le puede escribir libremente a este cliente POR ESTE NÚMERO?
 *
 * `ultimoEntranteDelCanal` tiene que ser el del canal, no el de la persona: la
 * ficha del cliente mezcla los dos números y por eso decía "abierta" cuando el
 * cliente había escrito hace un rato por el OTRO — el mensaje salía y moría.
 *
 * Ante cualquier duda devuelve `false`, y la asimetría es deliberada:
 *   · un falso "abierta" manda un mensaje que muere en Meta y el vendedor cree
 *     que llegó — los 209 de agosto;
 *   · un falso "cerrada" solo obliga a mandar una plantilla.
 * Por eso una fecha nula o corrupta cuenta como cerrada.
 */
export function ventanaAbierta(ultimoEntranteDelCanal, ahoraMs = Date.now()) {
  if (!ultimoEntranteDelCanal) return false     // sin entrante nunca se abrió
  const t = Date.parse(ultimoEntranteDelCanal)
  if (!Number.isFinite(t)) return false          // fecha corrupta → cerrada
  return ahoraMs - t < VENTANA_MS
}

/**
 * Qué se actualiza cuando se guarda un mensaje: la ficha de la PERSONA y la fila
 * de la CONVERSACIÓN. Devuelve `{ conv, bandeja }` (bandeja `null` si no hay canal).
 *
 * ☠️ ACÁ VIVÍA EL PEOR BUG DE ESTE INBOX. La versión vieja de IND hacía, en
 * `inbox-supabase.js:544`:
 *
 *     if (fila.phone_id) patchConv.phone_id = fila.phone_id
 *
 * sin mirar la dirección. O sea que un mensaje que SALÍA redefinía "el número por
 * el que habla esta persona", y la interfaz leía ese campo para decidir por dónde
 * mandar el siguiente. Efecto bola de nieve: el primer envío por el número
 * equivocado contaminaba la ficha y arrastraba a todos los que venían detrás. Son
 * los 130 mensajes de agosto en los que la ficha "ya decía" el canal malo — lo
 * decía porque el propio error lo había escrito.
 *
 * La regla es de una línea: **solo un ENTRANTE dice por dónde habla el cliente.**
 * Un saliente dice por dónde hablamos nosotros, que no es lo mismo y no sirve para
 * decidir nada — de hecho es justo lo que hay que verificar, no lo que hay que creer.
 */
export function patchesDeMensaje({ direccion, phone_id: phoneId, fecha }) {
  const esEntrante = String(direccion || '').trim().toUpperCase() === 'ENTRANTE'

  const conv = { ultimo_mensaje_at: fecha }
  if (esEntrante) {
    conv.ultimo_entrante_at = fecha
    if (phoneId) conv.phone_id = phoneId
  }

  // Sin canal no se escribe bandeja: una fila sin número no significa nada y se
  // mezclaría con cualquier otro mensaje que llegue igual de huérfano.
  if (!phoneId) return { conv, bandeja: null }

  const bandeja = { ultimo_mensaje_at: fecha }
  if (esEntrante) {
    bandeja.ultimo_entrante_at = fecha
    // Un entrante devuelve SU conversación a PENDIENTE siempre, venga del estado
    // que venga. Es la regla de Rodrigo, y ahora es por canal: si escribe por el
    // 3326 se reabre el 3326 y la del 9804 queda como estaba.
    bandeja.estado = 'PENDIENTE'
  }
  return { conv, bandeja }
}

/**
 * ¿Este acuse de entrega tiene que devolver el chat a PENDIENTE?
 *
 * ⚠️ LA RED DE SEGURIDAD, y la pieza que hace visible todo lo demás.
 *
 * Meta contesta **200 con wamid** al enviar, así que el inbox da el mensaje por
 * salido y pasa el chat a ATENDIDO. El rechazo llega DESPUÉS, por webhook. Hasta
 * hoy eso solo escribía `estado_entrega='failed'` en la fila del mensaje y nadie
 * movía el chat: los 26 clientes de agosto siguen en ATENDIDO sin haber recibido
 * nada, y la burbuja los marca con una ⚠ de 11 px en una conversación que el
 * vendedor ya cerró.
 *
 * Eso rompe la regla que sostiene toda la bandeja:
 *
 *   "si esa bandeja está vacía, contesté a todos"
 *
 * Un mensaje que no llegó no es una respuesta. Vuelve a Pendientes.
 *
 * Dos asimetrías deliberadas:
 *   · Reabre desde CUALQUIER estado, igual que un entrante. No hay estado
 *     deliberado que sobreviva a un cliente que no recibió su mensaje.
 *   · Si NO se sabe en qué estado está el chat, reabre igual. Un chat de más en
 *     Pendientes cuesta una mirada; uno de menos es un cliente que nadie abre.
 *
 * Y una guarda de costo: si ya está en PENDIENTE devuelve `false`. Los statuses
 * son 7.177 al día en IND —la ruta más llamada de la app—, así que no se escribe
 * PENDIENTE sobre PENDIENTE por gusto.
 */
export function reabrePorEntregaFallida(estadoEntrega, estadoActual) {
  if (String(estadoEntrega || '').trim().toLowerCase() !== 'failed') return false
  return String(estadoActual || '').trim().toUpperCase() !== 'PENDIENTE'
}

/**
 * ¿Por cuál de NUESTROS números es alcanzable esta persona, y está abierta ahí?
 *
 * ⚠️ ESTA ES LA OTRA MITAD DEL BUG DE AGOSTO — los 79 mensajes que no entraron
 * por la bola de nieve. `/api/directorio` (la pestaña CONTACTOS) es la AGENDA:
 * una fila por persona, sin canal. Calculaba la ventana así:
 *
 *     const entMs = c.ultimoEntranteAt ...
 *     dentro24h: entMs > 0 && now - entMs < DIA_MS
 *
 * `ultimoEntranteAt` es el de la PERSONA, mezclando los dos números. O sea que
 * pintaba la ventana en VERDE porque el cliente había escrito al OTRO número, y
 * después mandaba con el canal de la PESTAÑA. Las dos mitades del error a la vez:
 * el vendedor veía "se puede escribir", escribía, y el mensaje moría en Meta.
 *
 * Ahora `inbox.bandeja` tiene una fila por (cliente, número), así que la pregunta
 * se puede contestar de verdad: gana el número por el que escribió MÁS RECIENTE,
 * y la ventana se mide contra ESE.
 *
 * ⚠️ Un canal sin entrante NUNCA gana, y sin filas devuelve canal vacío en vez de
 * inventar el principal. Devolver un número por defecto acá es exactamente cómo
 * mueren los mensajes: el envío sale, Meta lo rechaza y el vendedor lo ve salir.
 * Quien llame decide qué hacer con el vacío — pero que sea una decisión, no un
 * descuido.
 *
 * @param bandejas filas de `inbox.bandeja` de UNA persona: { phone_id, ultimo_entrante_at }
 */
export function canalParaEscribir(bandejas, ahoraMs = Date.now()) {
  const vacio = { canal: '', dentro24h: false, ultimoEntranteAt: null }
  if (!Array.isArray(bandejas) || bandejas.length === 0) return vacio

  let mejor = null
  let mejorT = -Infinity
  for (const b of bandejas) {
    // Sin entrante no hay ventana: ese número nunca se abrió. Y una fecha
    // corrupta no puede ganarle a una buena — se descarta, no se asume.
    const t = Date.parse(b?.ultimo_entrante_at)
    if (!Number.isFinite(t)) continue
    if (t > mejorT) { mejorT = t; mejor = b }
  }
  if (!mejor) return vacio

  return {
    canal: String(mejor.phone_id || ''),
    dentro24h: ventanaAbierta(mejor.ultimo_entrante_at, ahoraMs),
    ultimoEntranteAt: mejor.ultimo_entrante_at,
  }
}

/**
 * Qué estado PINTA la pantalla para una conversación. Tres fuentes, en orden:
 *
 *   1. `override`      — lo que el vendedor acaba de tocar, mientras no venza.
 *   2. `estadoBandeja` — la verdad nueva, DE ESTE CANAL (vista lista_bandeja).
 *   3. `estadoPersona` — el estado viejo, uno por persona (`conversaciones`).
 *
 * ☠️ EL PASO 1 NO ES COSMÉTICO. El estado de bandeja llega por el poll, que pasa
 * por un caché de edge de hasta 25 s. Sin el override, el vendedor marca ATENDIDO,
 * el botón cambia, y al siguiente ciclo **se revierte solo** con el valor viejo.
 * Es la familia "la pantalla miente", y en este inbox ya costó caro.
 *
 * El paso 3 existe porque `estadoBandeja` viene vacío mientras la fila no llega
 * (o en un chat que solo existe en los hilos). Vacío ≠ pendiente: devolver
 * 'pendiente' ahí pintaría de pendiente medio inbox durante la carga.
 *
 * Sin nada, 'pendiente': ante la duda que se vea. Un chat de más en Pendientes
 * cuesta una mirada; uno de menos es un cliente que nadie vuelve a abrir.
 */
export function estadoVisible({ override, estadoBandeja, estadoPersona, ahoraMs = Date.now() } = {}) {
  if (override && Number(override.expiresAt) > ahoraMs && override.estado) return override.estado
  return estadoBandeja || estadoPersona || 'pendiente'
}
