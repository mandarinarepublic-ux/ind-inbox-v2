// Las primeras pruebas multi-número de IND.
//
// ⚠️ POR QUÉ EXISTEN, con números. Del 22 al 26 de agosto de 2026, IND mandó
// 209 mensajes a 26 clientes que NUNCA llegaron. Meta los rechazó con 131047 y
// el inbox los dio por enviados. Medido después, sin supuestos:
//
//   · 209 de 209 salieron por un número al que ese cliente nunca escribió.
//   · 209 de 209 tenían la ventana ABIERTA en el OTRO número, a 18 min de promedio.
//   · A un solo cliente le fallaron 25 mensajes seguidos.
//
// Se parte en dos causas distintas, y cada una tiene su prueba acá abajo:
//
//   130 msgs / 18 clientes → la ficha del cliente YA decía el número equivocado,
//                            porque un SALIENTE lo había reescrito (bola de nieve).
//    79 msgs /  8 clientes → la ficha decía el bueno y el envío la ignoró.
//
// MANDI arregló esto el 19-ago y lo dejó probado; IND se quedó con el código
// viejo. Este archivo es la mitad que faltaba: sin una prueba que fije la regla,
// esta familia ya llegó a producción CUATRO veces, y dos las metió un arreglo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canalDeEnvio,
  ventanaAbierta,
  patchesDeMensaje,
  reabrePorEntregaFallida,
  canalParaEscribir,
  opcionesDeCanal,
  VENTANA_MS,
} from '../lib/bandeja.js'

// Los dos números reales de IND (lib/canales.js).
const N3326 = '1153686904504422'  // el de la pauta
const N9804 = '2241248862581450'  // el que vive en el celular (coexistencia)

// ── Por dónde sale la respuesta ───────────────────────────────────────────────

test('manda la CONVERSACIÓN, no la pestaña', () => {
  // El caso de los 79: el vendedor está parado en la pestaña del 9804 y le
  // contesta a alguien que escribió al 3326. Tiene que salir por el 3326.
  assert.equal(canalDeEnvio({ conversacion: N3326, pestana: N9804 }), N3326)
})

test('sin conversación abierta cae a la pestaña', () => {
  // CONTACTOS manda sin chat abierto: ahí la pestaña es lo único que hay.
  assert.equal(canalDeEnvio({ conversacion: '', pestana: N9804 }), N9804)
})

test('NUNCA devuelve vacío', () => {
  // Un canal vacío no revienta: cae al número principal EN SILENCIO. Así es
  // exactamente como mueren los mensajes.
  assert.equal(canalDeEnvio({ porDefecto: N3326 }), N3326)
  assert.equal(canalDeEnvio({}), '')
  assert.equal(canalDeEnvio(), '')
})

// ── La ventana de 24 h se mide POR CANAL ──────────────────────────────────────

test('la ventana se mide POR CANAL, no por persona', () => {
  // Caso real, 0993752371 (José RAsetio): escribió al 3326 a las 13:37 y se le
  // respondió por el 9804 a las 13:42. La ficha de la PERSONA decía "escribió
  // hace 5 minutos" y por eso salieron 25 mensajes. Los 25 murieron.
  const ahora = Date.parse('2026-08-26T18:42:00Z')
  assert.equal(ventanaAbierta('2026-08-26T18:37:00Z', ahora), true)   // 3326
  assert.equal(ventanaAbierta(null, ahora), false)                    // 9804: jamás escribió
})

test('un canal sin NINGÚN entrante tiene la ventana cerrada', () => {
  assert.equal(ventanaAbierta(null, Date.now()), false)
  assert.equal(ventanaAbierta('', Date.now()), false)
})

test('la ventana cierra exactamente a las 24 h', () => {
  const ahora = Date.parse('2026-08-26T12:00:00Z')
  assert.equal(ventanaAbierta(new Date(ahora - VENTANA_MS + 1000).toISOString(), ahora), true)
  assert.equal(ventanaAbierta(new Date(ahora - VENTANA_MS - 1000).toISOString(), ahora), false)
})

test('una fecha corrupta deja la ventana CERRADA, no abierta', () => {
  // La asimetría es deliberada: un falso "abierta" manda un mensaje que muere en
  // Meta y el vendedor cree que llegó. Un falso "cerrada" solo obliga a plantilla.
  assert.equal(ventanaAbierta('no-es-fecha', Date.now()), false)
})

// ── El efecto bola de nieve (los 130) ─────────────────────────────────────────
// inbox-supabase.js:544 hacía `if (fila.phone_id) patchConv.phone_id = fila.phone_id`
// sin mirar la dirección. Un mensaje que SALÍA redefinía "el número por el que
// habla esta persona", y la interfaz leía ese campo para elegir el siguiente
// envío: el primer error contaminaba la ficha y arrastraba a todos los de atrás.

test('un SALIENTE no cambia el canal de la persona', () => {
  const { conv } = patchesDeMensaje({ direccion: 'SALIENTE', phone_id: N9804, fecha: '2026-08-26T18:42:00Z' })
  assert.equal(conv.phone_id, undefined, 'un saliente NO puede redefinir el canal del cliente')
  assert.equal(conv.ultimo_entrante_at, undefined, 'un saliente tampoco reabre la ventana de 24h')
})

test('un ENTRANTE sí cambia el canal de la persona', () => {
  const { conv } = patchesDeMensaje({ direccion: 'ENTRANTE', phone_id: N3326, fecha: '2026-08-26T18:37:00Z' })
  assert.equal(conv.phone_id, N3326)
  assert.equal(conv.ultimo_entrante_at, '2026-08-26T18:37:00Z')
})

test('un ENTRANTE reabre a PENDIENTE, y solo la bandeja de SU canal', () => {
  const { bandeja } = patchesDeMensaje({ direccion: 'ENTRANTE', phone_id: N3326, fecha: '2026-08-26T18:37:00Z' })
  assert.equal(bandeja.estado, 'PENDIENTE')
  assert.equal(bandeja.ultimo_entrante_at, '2026-08-26T18:37:00Z')
})

test('un SALIENTE NO reabre la bandeja (contestar no es un pendiente nuevo)', () => {
  const { bandeja } = patchesDeMensaje({ direccion: 'SALIENTE', phone_id: N9804, fecha: '2026-08-26T18:42:00Z' })
  assert.equal(bandeja.estado, undefined)
  assert.equal(bandeja.ultimo_mensaje_at, '2026-08-26T18:42:00Z')
})

test('sin phone_id NO se escribe bandeja', () => {
  // Una fila sin número no significa nada y se mezclaría con cualquier otra que
  // llegue igual de huérfana.
  const { bandeja } = patchesDeMensaje({ direccion: 'ENTRANTE', phone_id: null, fecha: '2026-08-26T18:37:00Z' })
  assert.equal(bandeja, null)
})

test('la dirección en minúsculas se trata igual que en MAYÚSCULAS', () => {
  // En la base está en MAYÚSCULAS, pero una sola fila en minúsculas haría que un
  // entrante no reabra la bandeja y el cliente desaparezca de Pendientes.
  const { bandeja } = patchesDeMensaje({ direccion: 'entrante', phone_id: N3326, fecha: '2026-08-26T18:37:00Z' })
  assert.equal(bandeja.estado, 'PENDIENTE')
})

// ── La red de seguridad: un fallo devuelve el chat a PENDIENTE ────────────────
// Meta contesta 200 con wamid al enviar, así que el inbox marca el chat ATENDIDO
// y lo saca de la bandeja. El rechazo llega DESPUÉS, por webhook. Hoy solo se
// escribe `estado_entrega='failed'` en la fila del mensaje y nadie mueve el chat:
// los 26 clientes de agosto siguen en ATENDIDO sin haber recibido nada.
//
// Rompe la regla de Rodrigo: "si esa bandeja está vacía, contesté a todos".

test('un failed devuelve el chat a PENDIENTE', () => {
  assert.equal(reabrePorEntregaFallida('failed', 'ATENDIDO'), true)
})

test('un failed reabre venga del estado que venga', () => {
  // Mismo criterio que un entrante: no hay "estados deliberados" que sobrevivan a
  // un cliente que no recibió su mensaje.
  for (const estado of ['ATENDIDO', 'SOPORTE', 'VENTA', 'ARCHIVADO']) {
    assert.equal(reabrePorEntregaFallida('failed', estado), true, `desde ${estado}`)
  }
})

test('un failed sobre un chat YA pendiente no escribe de más', () => {
  // Cada status de Meta es una invocación; reescribir PENDIENTE sobre PENDIENTE
  // es una escritura por gusto en la ruta más llamada de IND.
  assert.equal(reabrePorEntregaFallida('failed', 'PENDIENTE'), false)
  assert.equal(reabrePorEntregaFallida('failed', 'pendiente'), false)
})

test('sent, delivered y read NO tocan la bandeja', () => {
  // Son el 99% de los statuses (7.177 al día). Si alguno reabriera, la bandeja
  // se llenaría sola y dejaría de significar nada.
  for (const bueno of ['sent', 'delivered', 'read']) {
    assert.equal(reabrePorEntregaFallida(bueno, 'ATENDIDO'), false, bueno)
  }
})

test('un estado desconocido NO reabre', () => {
  assert.equal(reabrePorEntregaFallida('', 'ATENDIDO'), false)
  assert.equal(reabrePorEntregaFallida(null, 'ATENDIDO'), false)
  assert.equal(reabrePorEntregaFallida('inventado', 'ATENDIDO'), false)
})

test('si no se sabe en qué estado está el chat, un failed lo reabre igual', () => {
  // Ante la duda, que se vea. Un chat de más en Pendientes cuesta una mirada; uno
  // de menos es un cliente que nadie vuelve a abrir.
  assert.equal(reabrePorEntregaFallida('failed', null), true)
  assert.equal(reabrePorEntregaFallida('failed', ''), true)
  assert.equal(reabrePorEntregaFallida('failed', undefined), true)
})

test('FAILED en mayúsculas se trata igual', () => {
  assert.equal(reabrePorEntregaFallida('FAILED', 'ATENDIDO'), true)
})

// ── A qué número se le escribe desde CONTACTOS (los 79) ──────────────────────
// `/api/directorio` es la AGENDA: una fila por persona, sin canal. Calculaba
// `dentro24h` con el último entrante de la PERSONA —mezclando los dos números— y
// mandaba con el canal de la PESTAÑA. Las dos cosas a la vez: pintaba la ventana
// en verde porque el cliente había escrito al OTRO número, y después mandaba por
// el que estaba abierto en pantalla. 79 mensajes murieron así.
//
// Ahora que `inbox.bandeja` tiene una fila por (cliente, número), la pregunta se
// puede contestar bien: ¿por cuál número es alcanzable ESTA persona?

test('elige el canal donde el cliente escribió, no el de la pestaña', () => {
  // Caso real 0993752371: escribió al 3326 a las 13:37 y le contestaron por el
  // 9804, donde no había escrito nunca. 25 mensajes muertos.
  const ahora = Date.parse('2026-08-26T18:42:00Z')
  const r = canalParaEscribir([
    { phone_id: N3326, ultimo_entrante_at: '2026-08-26T18:37:00Z' },
    { phone_id: N9804, ultimo_entrante_at: null },
  ], ahora)
  assert.equal(r.canal, N3326)
  assert.equal(r.dentro24h, true)
})

test('con los dos abiertos gana el más reciente', () => {
  const ahora = Date.parse('2026-08-27T04:20:00Z')
  const r = canalParaEscribir([
    { phone_id: N9804, ultimo_entrante_at: '2026-08-27T03:18:22Z' },
    { phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' },
  ], ahora)
  assert.equal(r.canal, N3326, 'el último entrante manda')
})

test('un canal SIN entrante nunca gana, aunque sea el único con mensajes', () => {
  // Los 48 pares de IND en los que escribimos a alguien que jamás nos escribió
  // por ese número. Sin entrante no hay ventana: nunca se abrió.
  const r = canalParaEscribir([{ phone_id: N9804, ultimo_entrante_at: null }], Date.now())
  assert.equal(r.canal, '')
  assert.equal(r.dentro24h, false)
})

test('sin ninguna fila no inventa un canal', () => {
  // ⚠️ Devolver el número principal acá es exactamente cómo mueren los mensajes:
  // el envío sale, Meta lo rechaza y el vendedor lo ve salir.
  assert.deepEqual(canalParaEscribir([], Date.now()), { canal: '', dentro24h: false, ultimoEntranteAt: null })
  assert.deepEqual(canalParaEscribir(null, Date.now()), { canal: '', dentro24h: false, ultimoEntranteAt: null })
})

test('la ventana se mide contra EL CANAL ELEGIDO, no contra la persona', () => {
  // El bug de `/api/directorio`: escribió al 9804 hace 30 h y al 3326 nunca. La
  // agenda decía "escribió hace 30 h" y pintaba cerrado — bien — pero si hubiera
  // escrito al 9804 hace 1 h, pintaba ABIERTO y mandaba por el 3326.
  const ahora = Date.parse('2026-08-27T04:00:00Z')
  const r = canalParaEscribir([
    { phone_id: N9804, ultimo_entrante_at: '2026-08-25T22:00:00Z' },  // 30 h
  ], ahora)
  assert.equal(r.canal, N9804)
  assert.equal(r.dentro24h, false, 'cerrada: 30 h en ESE número')
})

test('una fecha corrupta no puede ganar el canal', () => {
  const ahora = Date.parse('2026-08-27T04:00:00Z')
  const r = canalParaEscribir([
    { phone_id: N9804, ultimo_entrante_at: 'no-es-fecha' },
    { phone_id: N3326, ultimo_entrante_at: '2026-08-27T03:50:00Z' },
  ], ahora)
  assert.equal(r.canal, N3326)
  assert.equal(r.dentro24h, true)
})

// ── Las opciones que ve el vendedor al escribir ──────────────────────────────
// Regla de Rodrigo: el sistema NO adivina por dónde mandar. Muestra los dos
// números con su estado real —"por acá está vivo, por acá toca plantilla"— y
// deja elegir, con el más fresco preseleccionado.
//
// Por qué es mejor que elegir solo: `canalParaEscribir` toma el último entrante,
// y eso falla en un caso muy real — el cliente escribe al 3326 por un pedido a
// las 10 y al 9804 por otra cosa a las 11. El vendedor está contestando el hilo
// del 3326 y el código manda por el 9804, EN SILENCIO. Acá `canalParaEscribir`
// pasa de decidir a PRESELECCIONAR.

const CANALES_IND = [
  { phoneId: N3326, etiqueta: '3326' },
  { phoneId: N9804, etiqueta: '9804' },
]

test('muestra TODOS los números, no solo por los que escribió', () => {
  // Un número al que nunca escribió sigue siendo alcanzable POR PLANTILLA. Si se
  // esconde, el vendedor no tiene cómo llegarle y no sabe por qué.
  const ops = opcionesDeCanal([{ phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' }],
                              CANALES_IND, Date.parse('2026-08-27T04:20:00Z'))
  assert.equal(ops.length, 2)
  assert.deepEqual(ops.map(o => o.etiqueta), ['3326', '9804'])
})

test('el más fresco va primero y viene preseleccionado', () => {
  const ops = opcionesDeCanal([
    { phone_id: N9804, ultimo_entrante_at: '2026-08-27T03:18:22Z' },
    { phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' },
  ], CANALES_IND, Date.parse('2026-08-27T04:20:00Z'))
  assert.equal(ops[0].etiqueta, '3326')
  assert.equal(ops[0].preseleccionado, true)
  assert.equal(ops[1].preseleccionado, false)
})

test('dice por cuál se puede escribir libre y por cuál toca plantilla', () => {
  const ops = opcionesDeCanal([
    { phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' },  // hace 5 min
    { phone_id: N9804, ultimo_entrante_at: '2026-08-25T22:00:00Z' },  // hace 30 h
  ], CANALES_IND, Date.parse('2026-08-27T04:20:00Z'))
  assert.equal(ops.find(o => o.etiqueta === '3326').dentro24h, true)
  assert.equal(ops.find(o => o.etiqueta === '9804').dentro24h, false)
})

test('un número al que nunca escribió va como cerrado, nunca como abierto', () => {
  const ops = opcionesDeCanal([{ phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' }],
                              CANALES_IND, Date.parse('2026-08-27T04:20:00Z'))
  const n = ops.find(o => o.etiqueta === '9804')
  assert.equal(n.dentro24h, false)
  assert.equal(n.ultimoEntranteAt, null)
})

test('si no escribió por NINGUNO, no hay preseleccionado', () => {
  // ⚠️ Es el caso que mata la clase entera de fallo: sin preselección la pantalla
  // no puede mandar sola, y el vendedor tiene que elegir a propósito.
  const ops = opcionesDeCanal([], CANALES_IND, Date.now())
  assert.equal(ops.length, 2)
  assert.equal(ops.some(o => o.preseleccionado), false)
  assert.equal(ops.every(o => o.dentro24h === false), true)
})

test('sin canales configurados devuelve lista vacía, no inventa uno', () => {
  assert.deepEqual(opcionesDeCanal([{ phone_id: N3326, ultimo_entrante_at: '2026-08-27T04:15:19Z' }], [], Date.now()), [])
})
