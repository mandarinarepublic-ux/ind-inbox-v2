import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirReactivacion, horaEcuador, ponerNombre, nombreDePila, parametrosReactivacion } from '../lib/reactivacion.js'

const H = 3600 * 1000
// 15:00 hora Ecuador = 20:00 UTC
const AHORA = Date.parse('2026-09-22T20:00:00Z')
const hace = (h) => new Date(AHORA - h * H).toISOString()
const PRINCIPAL = '1153686904504422'
const config = { ia: { principal: false, secundario: false }, reactivacion: { activo: true } }

// Cotizando: el cliente habló hace 3,5 h, una PERSONA contestó hace 3,2 h y se quedó callado.
const base = {
  telefono: '593999000111', nombre: 'Andrea López', alias: '', phoneId: PRINCIPAL, modoIA: true,
  estado: 'atendido', idVenta: '', etapa: 'cotizando', etapaAt: hace(4),
  ultimoEntranteAt: hace(3.5), ultimoMensajeAt: hace(3.2), ultimoHumanoAt: hace(3.2),
  ultimoSeguimientoAt: null, reactivacionN: 0, reactivacionAt: null,
}
const decidir = (c, extra = {}) => decidirReactivacion({ config, contacto: { ...base, ...c }, ahoraMs: AHORA, ...extra })

test('primer toque a las 3 h, con el nombre y el texto de la etapa', () => {
  const d = decidir({})
  assert.equal(d.toque, 1)
  assert.equal(d.nNuevo, 1)
  assert.match(d.texto, /^¡Hola Andrea! 👋 ¿Pudiste ver la propuesta\?/)
  assert.match(decidir({ etapa: 'esperando_pago' }).texto, /transferencia/)
})

test('apagada por defecto', () => {
  assert.equal(decidirReactivacion({ config: { ia: {} }, contacto: base, ahoraMs: AHORA }), null)
})

test('C1: chat 🔴 que solo recibió la respuesta del FLUJO (ninguna persona) → nunca', () => {
  // el flujo contestó (ultimoMensajeAt posterior) pero ninguna persona escribió
  assert.equal(decidir({ estado: 'pendiente', ultimoHumanoAt: null }), null)
  assert.equal(decidir({ estado: 'atendido', ultimoHumanoAt: null }), null)
  // una persona contestó ANTES del último mensaje del cliente → le toca a una persona
  assert.equal(decidir({ ultimoHumanoAt: hace(5) }), null)
  assert.equal(decidir({ estado: 'pendiente' }), null)
})

test('C2: el vendedor contestó hace minutos → no sale aunque el cliente lleve horas', () => {
  assert.equal(decidir({ ultimoEntranteAt: hace(5), ultimoHumanoAt: hace(0.1) }), null)
  assert.equal(decidir({ ultimoEntranteAt: hace(21), ultimoHumanoAt: hace(2.9) }), null)
  assert.ok(decidir({ ultimoEntranteAt: hace(21), ultimoHumanoAt: hace(3) }))
})

test('candados: 📌, 🤫, interno, archivado, venta, pedido reciente, etapa que no es 💬/💳', () => {
  assert.equal(decidir({ deudaAt: hace(1) }), null)
  assert.equal(decidir({ sinAutomaticos: true }), null)
  assert.equal(decidir({ tipoContacto: 'interno' }), null)
  assert.equal(decidir({ estado: 'archivado' }), null)
  assert.equal(decidir({ idVenta: 'IND-XAV-1' }), null)
  assert.equal(decidir({ etapa: 'falta_pedido' }), null)
  assert.equal(decidir({ etapa: 'postventa' }), null)
  assert.equal(decidir({ etapa: '' }), null)
  // I4: cualquier pedido de los últimos 3 días = ya compró, aunque sea "anterior" a la etapa
  assert.equal(decidir({ etapaAt: hace(1) }, { pedido: { fecha_pedido: hace(2) } }), null)
  assert.ok(decidir({}, { pedido: { fecha_pedido: hace(24 * 10) } }))
})

test('ventana cerrada o ya se mandó el último toque', () => {
  assert.equal(decidir({ ultimoEntranteAt: hace(24.1), ultimoHumanoAt: hace(23) }), null)
  assert.equal(decidir({ ultimoEntranteAt: hace(21), ultimoHumanoAt: hace(20), reactivacionN: 3, reactivacionAt: hace(5) }), null)
})

test('I2: después de la noche sale SOLO el toque más avanzado, sin ráfaga', () => {
  // el cliente escribió a las 20:00, contestamos 20:05; a las 08:00 (h=12) salta al toque 2
  const manana = Date.parse('2026-09-23T13:00:00Z') // 08:00 Ecuador
  const c = { ...base, ultimoEntranteAt: new Date(manana - 12 * H).toISOString(), ultimoHumanoAt: new Date(manana - 11.9 * H).toISOString() }
  const d = decidirReactivacion({ config, contacto: c, ahoraMs: manana })
  assert.equal(d.toque, 2)
  assert.equal(d.nNuevo, 2)
  // a las 10:00 no sale el 3 (h=14 < 20) y aunque llegara, ≥4 h entre toques
  const diez = manana + 2 * H
  const despues = { ...c, reactivacionN: 2, reactivacionAt: new Date(manana).toISOString(), ultimoSeguimientoAt: new Date(manana).toISOString() }
  assert.equal(decidirReactivacion({ config, contacto: despues, ahoraMs: diez }), null)
  // a las 16:00 (h=20) sí sale el 3
  const d3 = decidirReactivacion({ config, contacto: despues, ahoraMs: manana + 8 * H })
  assert.equal(d3.toque, 3)
})

test('≥4 h entre toques aunque el umbral ya se cumpla', () => {
  const c = { ultimoEntranteAt: hace(12.5), ultimoHumanoAt: hace(12), reactivacionN: 1, reactivacionAt: hace(3), ultimoSeguimientoAt: hace(3) }
  assert.equal(decidir(c), null)
  assert.equal(decidir({ ...c, reactivacionAt: hace(4), ultimoSeguimientoAt: hace(4) }).toque, 2)
})

test('I3: si ya salió la encuesta en esta ventana, la reactivación no escribe', () => {
  assert.equal(decidir({ ultimoSeguimientoAt: hace(1) }), null)
})

test('nunca de noche (22:00–08:00 Ecuador)', () => {
  const noche = Date.parse('2026-09-23T04:00:00Z') // 23:00 Ecuador
  const c = { ...base, ultimoEntranteAt: new Date(noche - 4 * H).toISOString(), ultimoHumanoAt: new Date(noche - 3.5 * H).toISOString() }
  assert.equal(decidirReactivacion({ config, contacto: c, ahoraMs: noche }), null)
})

test('el bot está llevando ese chat: se lo deja en paz', () => {
  assert.equal(decidirReactivacion({ config: { ...config, ia: { principal: true } }, contacto: base, ahoraMs: AHORA }), null)
})

test('I9: textos propios mandan; un texto vaciado apaga ese toque', () => {
  const propio = { ...config, reactivacion: { activo: true, textos: { cotizando: ['Hola {nombre}, ¿seguimos?'] } } }
  assert.equal(decidirReactivacion({ config: propio, contacto: base, ahoraMs: AHORA }).texto, 'Hola Andrea, ¿seguimos?')
  const vacio = { ...config, reactivacion: { activo: true, textos: { cotizando: ['', 'b', 'c'] } } }
  assert.equal(decidirReactivacion({ config: vacio, contacto: base, ahoraMs: AHORA }), null)
})

test('nombre de pila: alias primero; "Mamá", emojis o frases no se usan', () => {
  assert.equal(nombreDePila('', 'Andrea López'), 'Andrea')
  assert.equal(nombreDePila('Caro', 'Carolina Pérez'), 'Caro')
  assert.equal(nombreDePila('', 'Mamá'), '')
  assert.equal(nombreDePila('', 'Dios es amor'), '')
  assert.equal(nombreDePila('', '🌸✨'), '')
  assert.equal(nombreDePila('', 'JOSÉ'), 'José')
  assert.equal(ponerNombre('¡Hola {nombre}! 👋 ¿Pudiste?', ''), '¡Hola! 👋 ¿Pudiste?')
  assert.equal(ponerNombre('{nombre}, te escribo antes', ''), 'Te escribo antes')
  assert.equal(horaEcuador(Date.parse('2026-09-22T13:00:00Z')), 8)
})

test('parámetros editables desde AUTOS, con límites seguros', () => {
  assert.deepEqual(parametrosReactivacion({}), { horas: [3, 12, 20], indiceTexto: [0, 1, 2], silencioMinH: 3, entreToquesH: 4, horaDesde: 8, horaHasta: 22 })
  const p = parametrosReactivacion({ horas: [20, '5', 5], silencio_min_h: 0, entre_toques_h: 99, hora_desde: 2, hora_hasta: 23 })
  assert.deepEqual(p.horas, [5, 20])          // sin repetidos, ordenadas
  assert.deepEqual(p.indiceTexto, [1, 0])     // cada hora con el texto que tenía al lado
  assert.equal(p.silencioMinH, 1)
  assert.equal(p.entreToquesH, 12)
  assert.equal(p.horaDesde, 6)                // nunca antes de las 06:00
  assert.equal(p.horaHasta, 22)               // nunca después de las 22:00
})

test('las horas editadas se respetan', () => {
  const cfg = { ...config, reactivacion: { activo: true, horas: [5, 12, 20] } }
  assert.equal(decidirReactivacion({ config: cfg, contacto: base, ahoraMs: AHORA }), null)   // h=3.5 < 5
  const c = { ...base, ultimoEntranteAt: hace(5.5), ultimoHumanoAt: hace(5) }
  assert.equal(decidirReactivacion({ config: cfg, contacto: c, ahoraMs: AHORA }).toque, 1)
})

test('horas escritas en desorden: cada hora sale con el texto que tenía al lado', () => {
  const cfg = { ...config, reactivacion: { activo: true, horas: [12, 3, 20], textos: { cotizando: ['texto de 12 h', 'texto de 3 h', 'texto de 20 h'] } } }
  assert.equal(decidirReactivacion({ config: cfg, contacto: base, ahoraMs: AHORA }).texto, 'texto de 3 h')
})

test('26-sep: quien solo PREGUNTÓ (sin etapa) recibe los toques de 12 h y 23 h solo si se pidió', () => {
  const cfg = { ia: { principal: false, secundario: false }, reactivacion: { activo: true, incluir_sin_etapa: true, horas: [12, 23] } }
  const c12 = { ...base, etapa: '', etapaAt: null, ultimoEntranteAt: hace(12.5), ultimoHumanoAt: hace(12.2) }
  const d = decidirReactivacion({ config: cfg, contacto: c12, ahoraMs: AHORA })
  assert.equal(d.etapa, 'pregunto')
  assert.match(d.texto, /^¡Hola Andrea! 👋 Me preguntaste/)
  const d2 = decidirReactivacion({ config: cfg, contacto: { ...c12, ultimoEntranteAt: hace(23.2), reactivacionN: 1, reactivacionAt: hace(11) }, ahoraMs: AHORA })
  assert.equal(d2.toque, 2)
  assert.match(d2.texto, /IND10/)
  // sin la opción, igual que antes: sin etapa no se escribe
  assert.equal(decidirReactivacion({ config: { ...cfg, reactivacion: { activo: true, horas: [12, 23] } }, contacto: c12, ahoraMs: AHORA }), null)
  // postventa / falta pedido nunca
  assert.equal(decidirReactivacion({ config: cfg, contacto: { ...c12, etapa: 'postventa' }, ahoraMs: AHORA }), null)
})

test('26-sep: solo_canales deja fuera un número caído', () => {
  const cfg = { ia: { principal: false, secundario: false }, reactivacion: { activo: true, solo_canales: ['1153686904504422'] } }
  assert.ok(decidirReactivacion({ config: cfg, contacto: base, ahoraMs: AHORA }))
  assert.equal(decidirReactivacion({ config: cfg, contacto: { ...base, phoneId: '2241248862581450' }, ahoraMs: AHORA }), null)
})
