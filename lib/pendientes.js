// lib/pendientes.js — reglas del recordatorio de chats sin contestar (línea IND).
//
// Puerto 1:1 desde wa-inbox-next (MANDARINA), con DOS diferencias deliberadas:
// el techo de espera (acá abajo, ESPERA_MAXIMA_MS) y que `textoAviso` sabe
// mencionar el arrastre (chats que cruzaron el techo). Ver el porqué de cada una
// en su propio comentario.
//
// Todo acá es PURO: sin base, sin red, sin relojes escondidos. Es a propósito —
// es la parte que se puede equivocar, así que es la parte que se puede probar.
//
// La diferencia con el push: el push avisa de un EVENTO (entró un mensaje) y por
// eso se puede perder. Esto avisa de un ESTADO (hay gente esperando) y por eso
// insiste hasta que vacíes la bandeja. Es la regla de Rodrigo puesta en código:
// "si esa bandeja está vacía, contesté a todos".

const MIN = 60 * 1000

/** Cuánto tiene que llevar esperando un chat para que valga la pena avisar. */
export const ESPERA_MINIMA_MS = 10 * MIN
/** Cada cuánto se vuelve a insistir por el mismo chat, si sigue sin contestar. */
export const REPETIR_CADA_MS = 30 * MIN

/**
 * Techo de la espera — 2 HORAS, no 24 como en MANDI.
 *
 * Medido en producción el 12-ago-2026: IND tenía 285 chats en Pendientes.
 * Con techo de 24h (el de MANDI) el aviso nombraría 81 — un número grande y sin
 * urgencia real. Con techo de 2h nombra 24. La diferencia no es cosmética: IND
 * recibe ~40 clientes nuevos por día y contesta pocos, así que "81 pendientes"
 * es un dato cierto pero inútil (nadie vacía esa bandeja hoy), mientras que 2h es
 * la ventana en la que una respuesta rápida todavía puede cerrar la venta antes
 * de que el cliente se enfríe o compre en otro lado. Pasadas las 2h, seguir
 * nombrando ESE chat en el aviso de "urgente" es ruido — por eso ahora existe
 * `partirPorAntiguedad`: lo viejo no desaparece, se cuenta aparte como arrastre.
 */
export const ESPERA_MAXIMA_MS = 2 * 60 * 60 * 1000

export const HORA_ABRE = 8
export const HORA_CIERRA = 21

/**
 * Hora del día en Ecuador (0-23). Ecuador es UTC−5 fijo y NO tiene horario de
 * verano, así que restar 5 h y leer en UTC es exacto — y a diferencia de
 * `getHours()`, no depende de la zona de la máquina ni del servidor.
 */
export function horaEcuador(ms) {
  return new Date(ms - 5 * 3600 * 1000).getUTCHours()
}

export function enHorarioLaboral(ms) {
  const h = horaEcuador(ms)
  return h >= HORA_ABRE && h < HORA_CIERRA
}

/** Espera en milisegundos de un chat, o null si no se puede medir. */
function esperaDe(c, ahoraMs) {
  if (!c?.ultimoEntranteAt) return null
  const t = Date.parse(c.ultimoEntranteAt)
  if (Number.isNaN(t)) return null
  return ahoraMs - t
}

/**
 * De todos los contactos, ¿por cuáles toca avisar ahora? Ordenados del que más
 * espera al que menos.
 *
 * Un chat sin `ultimoEntranteAt` queda FUERA: no se puede medir su espera, y
 * avisar de algo que no sabemos medir es ruido que enseña a ignorar los avisos.
 */
export function chatsQueAvisar(contactos, ahoraMs) {
  if (!enHorarioLaboral(ahoraMs)) return []
  return (contactos || [])
    .filter((c) => String(c?.estado || '').toLowerCase() === 'pendiente')
    .map((c) => ({ c, espera: esperaDe(c, ahoraMs) }))
    .filter(({ c, espera }) => {
      if (espera === null || espera < ESPERA_MINIMA_MS) return false
      // Techo: pasadas las 2h ya no es velocidad de respuesta, es arrastre. Entra
      // si espera exactamente 2h, no entra un pelo mas.
      if (espera > ESPERA_MAXIMA_MS) return false
      // Anti-repetición: guardado en la BASE, no en RAM. Las funciones de Vercel
      // son efímeras y un Set en memoria manda duplicados — misma lección que
      // dejó el enfriamiento del push.
      if (!c.ultimoAvisoTelegramAt) return true
      const prev = Date.parse(c.ultimoAvisoTelegramAt)
      if (Number.isNaN(prev)) return true
      // Si el aviso es ANTERIOR al último entrante, era de otra espera: contestaste
      // y la clienta volvió a escribir. Esta espera es nueva y arranca limpia. Sin
      // esto, la marca vieja tapa el mensaje nuevo hasta completar los 30 min —
      // silencio justo en el chat más activo, al revés de lo que se busca.
      const entrante = Date.parse(c.ultimoEntranteAt)
      if (!Number.isNaN(entrante) && prev < entrante) return true
      return ahoraMs - prev >= REPETIR_CADA_MS
    })
    .sort((a, b) => b.espera - a.espera)
    .map(({ c }) => c)
}

/**
 * Parte los PENDIENTES en dos: `recientes` (dentro del techo, candidatos a
 * notificarse) y `arrastre` (lo cruzaron). Un chat que no llega al mínimo no
 * entra en ninguno de los dos — igual que en `chatsQueAvisar`, no se puede medir
 * si vale la pena avisar de algo que acaba de llegar.
 *
 * Nace porque dos revisores de MANDI cazaron el mismo defecto ahí: un chat que
 * cruza el techo se vuelve INVISIBLE para Telegram — ni se notifica (correcto,
 * ya no es urgente) ni se menciona (incorrecto: un Telegram callado se lee como
 * "bandeja limpia", y no lo está). Pesa mucho más acá que en MANDI: 24 chats
 * DENTRO del techo contra 285 pendientes en total, no 12 contra ~20.
 *
 * ⚠️ Filtra por `estado === 'pendiente'`, IGUAL que `chatsQueAvisar`. Sin este
 * filtro el arrastre se llena de conversaciones ATENDIDO/VENTA/ARCHIVADO viejas
 * que no le corresponden a nadie atender — el dueño trabaja con una sola
 * garantía ("si Pendientes está vacío, contesté a todos") y el arrastre tiene
 * que respetarla, no inventar una cola paralela. Medido en producción: sin el
 * filtro el aviso diría "(+2.460 de más de 2 h)" en vez de "(+207 ...)" — el 92%
 * del número serían conversaciones que YA están resueltas. Si alguien saca este
 * filtro "para simplificar", ese es el número que revive.
 */
export function partirPorAntiguedad(contactos, ahoraMs) {
  const recientes = []
  const arrastre = []
  for (const c of contactos || []) {
    if (String(c?.estado || '').toLowerCase() !== 'pendiente') continue
    const espera = esperaDe(c, ahoraMs)
    if (espera === null || espera < ESPERA_MINIMA_MS) continue
    if (espera > ESPERA_MAXIMA_MS) arrastre.push(c)
    else recientes.push(c)
  }
  return { recientes, arrastre }
}

/** "1 h 30 min", "45 min". Legible de un vistazo en la pantalla de bloqueo. */
export function esperaLegible(ms) {
  const totalMin = Math.floor(ms / MIN)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * Escapa lo que Telegram interpreta como HTML. El nombre viene del perfil de
 * WhatsApp, o sea que lo escribe la clienta: un `<` suelto hace que Telegram
 * rechace el mensaje entero con un 400 y el recordatorio se pierda. Son los tres
 * caracteres que pide la documentación de Telegram, y el `&` va primero para no
 * re-escapar lo que uno mismo acaba de poner.
 */
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * El texto del aviso. Nombra al que más espera y cuánto lleva — un número solo
 * ("3 pendientes") no mueve a nadie; "Bea lleva 1 h 30 min" sí.
 *
 * `arrastre` (4º parámetro, opcional) es la CANTIDAD de chats que cruzaron el
 * techo — nunca la lista, y nunca se estampan ni se cuentan como notificados
 * acá adentro: esta función solo redacta texto, no decide ni marca nada. Cuando
 * es mayor que 0 agrega una línea aparte nombrando el número, para que el
 * arrastre quede MENCIONADO en vez de invisible (ver `partirPorAntiguedad`).
 * Con 0 (o sin pasarlo) el mensaje sale IDÉNTICO al de antes de esta función
 * tener un 4º parámetro — nada de paréntesis vacíos ni líneas de más.
 */
export function textoAviso(chats, ahoraMs, baseUrl, arrastre = 0) {
  if (!chats?.length) return ''
  const peor = chats[0]
  const espera = esperaLegible(esperaDe(peor, ahoraMs) ?? 0)
  const nombre = escaparHtml(peor.nombre || peor.telefono)
  const link = `${baseUrl}/inbox?tel=${encodeURIComponent(peor.telefono)}`

  let msg
  if (chats.length === 1) {
    msg = `⏳ <b>${nombre}</b> lleva <b>${espera}</b> esperando respuesta.\n\n${link}`
  } else {
    msg = `⏳ <b>${chats.length} chats esperando respuesta hoy</b>.\n` +
          `El que más espera: <b>${nombre}</b>, ${espera}.\n\n${link}`
  }

  if (arrastre > 0) {
    msg += `\n(+${arrastre} de más de ${esperaLegible(ESPERA_MAXIMA_MS)})`
  }
  return msg
}
