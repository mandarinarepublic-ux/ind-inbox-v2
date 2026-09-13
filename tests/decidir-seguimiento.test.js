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

const base = {
  telefono: '593999000111', phoneId: PRINCIPAL, modoIA: true, estado: 'atendido', idVenta: '',
  temperatura: '', ultimoEntranteAt: hace(23.5), ultimoMensajeAt: hace(23.5), ultimoSeguimientoAt: null,
}

test('caliente con 23 h de silencio dentro de la ventana: sale la regla caliente', () => {
  const d = decidirSeguimiento({ config: cfg({ caliente }), contacto: { ...base, temperatura: 'caliente' }, ahoraMs: AHORA })
  assert.equal(d?.motivo, 'caliente')
  assert.equal(d?.regla.texto, '¿Seguimos?')
})

test('caliente pero todavía no toca (menos horas que la regla): nada', () => {
  const c = { ...base, temperatura: 'caliente', ultimoEntranteAt: hace(10), ultimoMensajeAt: hace(10) }
  assert.equal(decidirSeguimiento({ config: cfg({ caliente }), contacto: c, ahoraMs: AHORA }), null)
})

test('ventana de 24 h cerrada: nada, ni caliente ni encuesta', () => {
  const c = { ...base, temperatura: 'caliente', ultimoEntranteAt: hace(25), ultimoMensajeAt: hace(24) }
  assert.equal(decidirSeguimiento({ config: cfg({ caliente, encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta: chat ATENDIDO, yo escribí último hace 6 h, el cliente hace 8 h → sale la encuesta', () => {
  const c = { ...base, ultimoEntranteAt: hace(8), ultimoMensajeAt: hace(6) }
  const d = decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA })
  assert.equal(d?.motivo, 'encuesta')
  assert.equal(d?.regla.botones[0].title, 'Es el precio')
})

test('encuesta NO sale si el último mensaje es del CLIENTE (yo no he contestado)', () => {
  const c = { ...base, ultimoEntranteAt: hace(8), ultimoMensajeAt: hace(8) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta NO sale si el chat no está en ATENDIDO', () => {
  const c = { ...base, estado: 'pendiente', ultimoEntranteAt: hace(8), ultimoMensajeAt: hace(6) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('encuesta NO sale si aún no pasaron las horas desde MI último mensaje', () => {
  const c = { ...base, ultimoEntranteAt: hace(8), ultimoMensajeAt: hace(2) }
  assert.equal(decidirSeguimiento({ config: cfg({ encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('máximo un automático por ventana: si ya hubo seguimiento después del último entrante, nada', () => {
  const c = { ...base, temperatura: 'caliente', ultimoSeguimientoAt: hace(1) }
  assert.equal(decidirSeguimiento({ config: cfg({ caliente, encuesta }), contacto: c, ahoraMs: AHORA }), null)
})

test('la temperatura manda sobre la encuesta cuando las dos aplican', () => {
  const c = { ...base, temperatura: 'caliente', ultimoEntranteAt: hace(23.5), ultimoMensajeAt: hace(23) }
  const d = decidirSeguimiento({ config: cfg({ caliente, encuesta }), contacto: c, ahoraMs: AHORA })
  assert.equal(d?.motivo, 'caliente')
})

test('ya es venta o está archivado: nada', () => {
  const c1 = { ...base, temperatura: 'caliente', idVenta: 'IND-1' }
  const c2 = { ...base, temperatura: 'caliente', estado: 'archivado' }
  assert.equal(decidirSeguimiento({ config: cfg({ caliente }), contacto: c1, ahoraMs: AHORA }), null)
  assert.equal(decidirSeguimiento({ config: cfg({ caliente }), contacto: c2, ahoraMs: AHORA }), null)
})

test('el bot está contestando ese chat (número prendido + chat en IA): se lo deja en paz', () => {
  const config = { ia: { principal: true }, seguimientos: { activo: true, caliente } }
  assert.equal(decidirSeguimiento({ config, contacto: { ...base, temperatura: 'caliente' }, ahoraMs: AHORA }), null)
})

test('interruptor global apagado: nada aunque las reglas estén prendidas', () => {
  const config = { ia: { principal: false }, seguimientos: { activo: false, caliente } }
  assert.equal(decidirSeguimiento({ config, contacto: { ...base, temperatura: 'caliente' }, ahoraMs: AHORA }), null)
})
