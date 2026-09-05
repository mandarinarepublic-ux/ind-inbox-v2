// El estado de bandeja viaja PEGADO a la fila de la conversación.
//
// ⚠️ POR QUÉ ASÍ Y NO EN UNA LECTURA APARTE. En MANDI el primer intento traía la
// tabla `bandeja` entera por separado; como el mapa arranca vacío y "sin fila"
// significa PENDIENTE, al abrir el inbox TODAS las conversaciones se pintaban
// pendientes hasta que llegaba la respuesta. Pegado a la fila, ese instante no
// existe.
//
// IND puede hacerlo más simple que MANDI porque NO tiene bandeja GENERAL: la
// lista siempre viene filtrada a UN número (`getLista(canal)`), así que cada fila
// ya pertenece a un solo canal y no hace falta agrupar por (cliente, número).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConvs } from '../lib/utils.js'

const fila = (extra = {}) => ({
  telefono: '593987498489', nombre: 'Rodrigo', direccion: 'ENTRANTE',
  mensaje: 'hola', timestamp: '2026-08-27T04:15:19.000Z', id: 'wamid.1', ...extra,
})

test('la conversación lleva el estado de bandeja de SU canal', () => {
  const [conv] = buildConvs([fila({ estadoBandeja: 'pendiente' })])
  assert.equal(conv.estadoBandeja, 'pendiente')
})

test('la conversación lleva el último entrante DE ESE canal', () => {
  // No el de la persona: es lo que decide si la ventana de 24 h está abierta acá.
  const [conv] = buildConvs([fila({ ultimoEntranteCanal: '2026-08-27T04:15:19.000Z' })])
  assert.equal(conv.ultimoEntranteCanal, '2026-08-27T04:15:19.000Z')
})

test('si alguna fila trae el estado, no lo pisa una que venga sin él', () => {
  // A `buildConvs` le llegan la lista lateral (que SÍ trae estadoBandeja) + la
  // ventana de mensajes + los hilos cargados (que NO lo traen). Si ganara la
  // última, el estado se perdería y todo se vería pendiente.
  const [conv] = buildConvs([
    fila({ id: 'wamid.1', estadoBandeja: 'atendido' }),
    fila({ id: 'wamid.2', timestamp: '2026-08-27T04:20:00.000Z' }),
  ])
  assert.equal(conv.estadoBandeja, 'atendido')
})

test('sin estado de bandeja queda vacío, para que la pantalla caiga al viejo', () => {
  // Vacío ≠ 'pendiente'. Devolver 'pendiente' acá pintaría de pendiente cualquier
  // chat cuya fila todavía no llegó — el bug que MANDI ya pagó.
  const [conv] = buildConvs([fila()])
  assert.equal(conv.estadoBandeja, '')
  assert.equal(conv.ultimoEntranteCanal, null)
})

// ── Qué estado PINTA la pantalla ─────────────────────────────────────────────
// Tres fuentes, y el orden importa:
//   1. el override local (lo que el vendedor acaba de tocar)
//   2. el estado de bandeja DE ESE CANAL (la verdad nueva)
//   3. el estado viejo de la PERSONA (mientras la fila no llegue)
//
// ☠️ Sin el paso 1 esto se rompe de una forma muy fea: el estado de bandeja llega
// por el poll, que pasa por un caché de edge de hasta 25 s. O sea que marcas
// ATENDIDO, el botón cambia, y al siguiente ciclo se REVIERTE solo con el valor
// viejo. Es la familia "la pantalla miente" y ya costó caro en este inbox.
import { estadoVisible } from '../lib/bandeja.js'

const AHORA = 1_800_000_000_000

test('lo que el vendedor acaba de tocar gana sobre todo', () => {
  assert.equal(estadoVisible({
    override: { estado: 'atendido', expiresAt: AHORA + 30_000 },
    estadoBandeja: 'pendiente', estadoPersona: 'pendiente', ahoraMs: AHORA,
  }), 'atendido')
})

test('un override vencido ya no manda', () => {
  assert.equal(estadoVisible({
    override: { estado: 'atendido', expiresAt: AHORA - 1 },
    estadoBandeja: 'pendiente', estadoPersona: 'pendiente', ahoraMs: AHORA,
  }), 'pendiente')
})

test('sin override manda la bandeja DEL CANAL, no la persona', () => {
  // El caso que da sentido a todo: el cliente escribió por los dos números. Está
  // atendido acá y pendiente allá; la ficha de la persona no puede decidirlo.
  assert.equal(estadoVisible({ estadoBandeja: 'atendido', estadoPersona: 'pendiente', ahoraMs: AHORA }), 'atendido')
})

test('sin fila de bandeja cae al estado viejo de la persona', () => {
  assert.equal(estadoVisible({ estadoBandeja: '', estadoPersona: 'soporte', ahoraMs: AHORA }), 'soporte')
})

test('sin nada, pendiente', () => {
  // Ante la duda, que se vea. Un chat de más en Pendientes cuesta una mirada.
  assert.equal(estadoVisible({ ahoraMs: AHORA }), 'pendiente')
})

// ── DE QUE ANUNCIO VINO LA CONVERSACION ──────────────────────────
// Mismo patron y misma trampa que el estado de bandeja: el origen solo lo trae
// `lista_bandeja`, y `rows` (la ventana de mensajes recientes) va PRIMERO y no lo
// trae. Si viviera en el ultimo mensaje se perderia justo en los chats recientes
// —los pendientes, los que importan— y habria funcionado solo en los viejos:
// invisible al probar.

test('el origen del anuncio sobrevive aunque el ultimo mensaje no lo traiga', () => {
  const [conv] = buildConvs([
    fila({ id: 'wamid.1', mensaje: '¡Hola! Quiero más información.' }),
    fila({ id: 'wamid.1', mensaje: '¡Hola! Quiero más información.', origenAnuncio: '🕷️ Crewneck Oversize' }),
  ])
  assert.equal(conv.origenAnuncio, '🕷️ Crewneck Oversize')
})

test('un seguimiento posterior no borra el origen de la conversacion', () => {
  // El caso real: llega por el anuncio y despues escribe "y en talla M?". Ese
  // seguimiento pasa a ser el ultimo mensaje y NO trae el origen.
  const [conv] = buildConvs([
    fila({ id: 'wamid.1', mensaje: '¡Hola! Quiero más información.', origenAnuncio: '🕷️ Crewneck Oversize' }),
    fila({ id: 'wamid.2', mensaje: 'y en talla M tienen?', timestamp: '2026-08-27T05:02:00.000Z' }),
  ])
  assert.equal(conv.origenAnuncio, '🕷️ Crewneck Oversize')
  assert.equal(conv.last.mensaje, 'y en talla M tienen?')
})

// Un cliente sin rastro tiene que NOTARSE, no disfrazarse con el origen de otro.
test('una conversacion sin anuncio se queda sin origen', () => {
  const [conv] = buildConvs([fila()])
  assert.equal(conv.origenAnuncio, '')
})
