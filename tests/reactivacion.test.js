import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirReactivacion, horaEcuador, ponerNombre } from '../lib/reactivacion.js'

const H = 3600 * 1000
// 15:00 hora Ecuador = 20:00 UTC
const AHORA = Date.parse('2026-09-22T20:00:00Z')
const hace = (h) => new Date(AHORA - h * H).toISOString()
const PRINCIPAL = '1153686904504422'
const config = { ia: { principal: false, secundario: false }, reactivacion: { activo: true } }

// Cotizando, el cliente habló hace 3,5 h, contestamos hace 3 h y se quedó callado.
const base = {
  telefono: '593999000111', nombre: 'Andrea López', alias: '', phoneId: PRINCIPAL, modoIA: true,
  estado: 'atendido', idVenta: '', etapa: 'cotizando', etapaAt: hace(4),
  ultimoEntranteAt: hace(3.5), ultimoMensajeAt: hace(3), reactivacionN: 0, reactivacionAt: null,
}
const decidir = (c, extra = {}) => decidirReactivacion({ config, contacto: { ...base, ...c }, ahoraMs: AHORA, ...extra })

test('primer toque a las 3 h, con el nombre y el texto de la etapa', () => {
  const d = decidir({})
  assert.equal(d.toque, 1)
  assert.equal(d.etapa, 'cotizando')
  assert.match(d.texto, /^¡Hola Andrea! 👋 ¿Pudiste ver la propuesta\?/)
  assert.match(decidir({ etapa: 'esperando_pago' }).texto, /transferencia/)
})

test('apagada por defecto: sin config.reactivacion.activo no sale nada', () => {
  assert.equal(decidirReactivacion({ config: { ia: {} }, contacto: base, ahoraMs: AHORA }), null)
})

test('candados: 📌, 🤫, interno, archivado, con pedido, etapa que no es 💬/💳', () => {
  assert.equal(decidir({ deudaAt: hace(1) }), null)
  assert.equal(decidir({ sinAutomaticos: true }), null)
  assert.equal(decidir({ tipoContacto: 'interno' }), null)
  assert.equal(decidir({ estado: 'archivado' }), null)
  assert.equal(decidir({ idVenta: 'IND-XAV-1' }), null)
  assert.equal(decidir({ etapa: 'falta_pedido' }), null)
  assert.equal(decidir({ etapa: 'postventa' }), null)
  assert.equal(decidir({ etapa: '' }), null)
  // pedido en el CRM posterior a la etapa (en cualquier tienda) → ya compró
  assert.equal(decidir({}, { pedido: { fecha_pedido: hace(1) } }), null)
})

test('si el cliente habló último, le toca a una persona: nunca reactivación', () => {
  assert.equal(decidir({ ultimoMensajeAt: hace(3.5) }), null)
})

test('todavía no toca, ventana cerrada, o ya se mandaron los 3 toques', () => {
  assert.equal(decidir({ ultimoEntranteAt: hace(2), ultimoMensajeAt: hace(1.5) }), null)
  assert.equal(decidir({ ultimoEntranteAt: hace(24.1), ultimoMensajeAt: hace(24) }), null)
  assert.equal(decidir({ reactivacionN: 3, reactivacionAt: hace(4) }), null)
})

test('segundo toque a las 12 h y ≥2 h después del primero', () => {
  const c = { ultimoEntranteAt: hace(12.5), ultimoMensajeAt: hace(4), reactivacionN: 1, reactivacionAt: hace(4) }
  assert.equal(decidir(c).toque, 2)
  assert.equal(decidir({ ...c, reactivacionAt: hace(1) }), null)
})

test('nunca de noche (22:00–08:00 Ecuador); a las 08:00 sí', () => {
  const noche = Date.parse('2026-09-23T04:00:00Z') // 23:00 Ecuador
  assert.equal(decidirReactivacion({ config, contacto: { ...base, ultimoEntranteAt: new Date(noche - 4 * H).toISOString(), ultimoMensajeAt: new Date(noche - 3 * H).toISOString() }, ahoraMs: noche }), null)
  const manana = Date.parse('2026-09-23T13:00:00Z') // 08:00 Ecuador
  const d = decidirReactivacion({ config, contacto: { ...base, ultimoEntranteAt: new Date(manana - 13 * H).toISOString(), ultimoMensajeAt: new Date(manana - 12 * H).toISOString(), reactivacionN: 1, reactivacionAt: new Date(manana - 9 * H).toISOString() }, ahoraMs: manana })
  assert.equal(d?.toque, 2)
})

test('el bot está llevando ese chat: se lo deja en paz', () => {
  const conBot = { ...config, ia: { principal: true } }
  assert.equal(decidirReactivacion({ config: conBot, contacto: base, ahoraMs: AHORA }), null)
})

test('textos propios de la config mandan sobre los de defecto', () => {
  const cfg = { ...config, reactivacion: { activo: true, textos: { cotizando: ['Hola {nombre}, ¿seguimos?'] } } }
  assert.equal(decidirReactivacion({ config: cfg, contacto: base, ahoraMs: AHORA }).texto, 'Hola Andrea, ¿seguimos?')
})

test('horaEcuador y ponerNombre sin nombre', () => {
  assert.equal(horaEcuador(Date.parse('2026-09-22T13:00:00Z')), 8)
  assert.equal(ponerNombre('¡Hola {nombre}! 👋 ¿Pudiste?', ''), '¡Hola! 👋 ¿Pudiste?')
  assert.equal(ponerNombre('{nombre}, te escribo antes', ''), 'Te escribo antes')
  assert.equal(ponerNombre('¡Buen día {nombre}!', 'maría josé'), '¡Buen día maría!')
})
