import test from 'node:test'
import assert from 'node:assert'
import { decidirSeguimiento } from '../lib/decidir-seguimiento.js'

const H = 3600 * 1000
const AHORA = Date.parse('2026-09-13T12:00:00Z')
const hace = (h) => new Date(AHORA - h * H).toISOString()
const PRINCIPAL = '1153686904504422'

// Bot apagado en los dos números (como está hoy en IND): el seguimiento sale.
const cfg = (seg) => ({ ia: { principal: false, secundario: false }, seguimientos: { activo: true, ...seg } })
const caliente = { activo: true, horas: 23, texto: '¿Seguimos?', botones: [] }
const encuesta = { activo: true, horas: 6, texto: '¿Qué te frenó?', botones: [{ title: 'Es el precio' }] }

// Chat ATENDIDO: el cliente escribió hace 8 h, yo contesté hace 6 h.
const base = {
  telefono: '593999000111', phoneId: PRINCIPAL, modoIA: true, estado: 'atendido', idVenta: '',
  ultimoEntranteAt: hace(8), ultimoMensajeAt: hace(6), ultimoSeguimientoAt: null,
}

test('las reglas por temperatura ya NO mandan nada (diseño 2026-09-22), aunque la config vieja las tenga prendidas', () => {
  const c = { ...base, temperatura: 'caliente', ultimoEntranteAt: hace(23.5), ultimoMensajeAt: hace(23.5) }
  assert.equal(decidirSeguimiento({ config: cfg({ caliente }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta: chat ATENDIDO, yo escribí último hace 6 h, el cliente hace 8 h → sale la encuesta', () => {
  const d = decidirSeguimiento({ config: cfg({ encuesta }), contacto: base, ahoraMs: AHORA })
  assert.equal(d?.motivo, 'encuesta')
  assert.equal(d?.regla.botones[0].title, 'Es el precio')
})

test('ventana de 24 h cerrada: nada', () => {
  const c = { ...base, ultimoEntranteAt: hace(25), ultimoMensajeAt: hace(24) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta NO sale si el último mensaje es del CLIENTE (yo no he contestado)', () => {
  const c = { ...base, ultimoMensajeAt: hace(8) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta NO sale si el chat no está en ATENDIDO', () => {
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, estado: 'pendiente' }, ahoraMs: AHORA }), null)
})

test('encuesta NO sale si aún no pasaron las horas desde MI último mensaje', () => {
  const c = { ...base, ultimoMensajeAt: hace(2) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('máximo un automático por ventana: si ya hubo seguimiento después del último entrante, nada', () => {
  const c = { ...base, ultimoSeguimientoAt: hace(1) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('ya es venta o está archivado: nada', () => {
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, idVenta: 'IND-1' }, ahoraMs: AHORA }), null)
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, estado: 'archivado' }, ahoraMs: AHORA }), null)
})

test('🤫 sin automáticos o contacto interno: nada', () => {
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, sinAutomaticos: true }, ahoraMs: AHORA }), null)
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, tipoContacto: 'interno' }, ahoraMs: AHORA }), null)
})

test('le debemos algo (📌): no se le escribe al cliente', () => {
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: { ...base, deudaAt: hace(1) }, ahoraMs: AHORA }), null)
})

test('el bot está contestando ese chat (número prendido + chat en IA): se lo deja en paz', () => {
  const config = { ia: { principal: true }, seguimientos: { activo: true, encuesta } }
  assert.equal(decidirSeguimiento({ config, contacto: base, ahoraMs: AHORA }), null)
})

test('interruptor global apagado: nada aunque las reglas estén prendidas', () => {
  const config = { ia: { principal: false }, seguimientos: { activo: false, encuesta } }
  assert.equal(decidirSeguimiento({ config, contacto: base, ahoraMs: AHORA }), null)
})
