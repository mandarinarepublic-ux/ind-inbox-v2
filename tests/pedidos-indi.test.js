import test from 'node:test'
import assert from 'node:assert/strict'
import { pedidoParaIndi, cargarPedidosParaIndi, conTope } from '../lib/pedidos-indi.js'
import { buscarPedidosCliente } from '../lib/pedidos-cliente.js'

const base = (extra = {}) => ({
  pedido: { pedido_id: 'P1', estado_pedido: 'PENDIENTE', estado_pago: 'PENDIENTE', monto_total: 40, monto_abonado: 20,
    fecha_pedido: '2026-10-01T15:00:00Z', fecha_entrega_prometida: '2026-11-05T17:00:00Z', ...extra },
  items: [{ producto_nombre: 'Chompa', color: 'Negro', talla: 'M', cantidad: 2, area: 'ESTAMPADO', subestado: '', subestado_corte: 'CORTADO' }],
  logs: [],
  guia: null,
  ahora: new Date('2026-11-01T12:00:00Z'),
})

test('fechaPrometida en hora de Ecuador y sin coma', () => {
  assert.equal(pedidoParaIndi(base({ fecha_entrega_prometida: '2026-11-05T03:00:00Z' })).fechaPrometida, 'miércoles 4 de noviembre')
  assert.equal(pedidoParaIndi(base({ fecha_entrega_prometida: '2026-11-05T17:00:00Z' })).fechaPrometida, 'jueves 5 de noviembre')
  assert.equal(pedidoParaIndi(base({ fecha_entrega_prometida: null })).fechaPrometida, '')
})

test('atrasado: pasó el fin del día prometido en Ecuador, etapa < 3, no cancelado', () => {
  const ant = base()
  assert.equal(pedidoParaIndi({ ...ant, ahora: new Date('2026-11-06T06:00:00Z') }).atrasado, true)
  const guia = { numero: 'G1', transportista: 'Servientrega', fecha: '2026-11-02T10:00:00Z', foto: null }
  assert.equal(pedidoParaIndi({ ...ant, guia, ahora: new Date('2026-11-06T06:00:00Z') }).atrasado, false)
  assert.equal(pedidoParaIndi({ ...ant, ahora: new Date('2026-11-06T04:00:00Z') }).atrasado, false)
  const canc = base({ estado_pedido: 'CANCELADO' })
  assert.equal(pedidoParaIndi({ ...canc, ahora: new Date('2026-11-06T06:00:00Z') }).atrasado, false)
})

test('saldoPendiente como el CRM', () => {
  assert.equal(pedidoParaIndi(base()).saldoPendiente, true)
  assert.equal(pedidoParaIndi(base({ estado_pago: 'PAGADO' })).saldoPendiente, false)
  assert.equal(pedidoParaIndi(base({ monto_abonado: 40 })).saldoPendiente, false)
})

test('guia solo con etapa >= 3 y foto solo https', () => {
  const guia = { numero: 'G1', transportista: 'Servientrega', fecha: '2026-11-02T10:00:00Z', foto: 'http://x/a.jpg' }
  const p = pedidoParaIndi(base())
  assert.equal(p.etapa, 2)
  assert.equal(pedidoParaIndi({ ...base(), guia: null }).guia, null)
  const t = pedidoParaIndi({ ...base(), guia })
  assert.equal(t.etapa, 3)
  assert.deepEqual(t.guia, { numero: 'G1', transportista: 'Servientrega', foto: '' })
  assert.equal(pedidoParaIndi({ ...base(), guia: { ...guia, foto: 'https://x/a.jpg' } }).guia.foto, 'https://x/a.jpg')
})

test('forma de PedidoIndi', () => {
  const p = pedidoParaIndi(base())
  assert.equal(p.id, 'P1')
  assert.deepEqual(p.prendas, [{ nombre: 'Chompa', color: 'Negro', talla: 'M', cantidad: 2 }])
  assert.equal(p.etapaNombre, 'Producción')
  assert.equal(p.cancelado, false)
})

// crm falso: cada tabla devuelve sus filas; los filtros se ignoran salvo los que importan
function crmFalso(tablas, llamadas = []) {
  return {
    from(t) {
      const q = { t, filtros: [] }
      const api = {
        select: () => api,
        like: (c, v) => { q.filtros.push(['like', c, v]); return api },
        in: (c, v) => { q.filtros.push(['in', c, v]); return api },
        eq: (c, v) => { q.filtros.push(['eq', c, v]); return api },
        order: () => api, limit: () => api,
        then: (res, rej) => { llamadas.push(q); return Promise.resolve({ data: tablas[t] || [], error: null }).then(res, rej) },
      }
      return api
    },
  }
}

test('cargarPedidosParaIndi deja solo INDSTORE', async () => {
  const crm = crmFalso({
    cliente_conversacion: [{ cliente_id: 'C1' }],
    clientes: [],
    pedidos: [
      { pedido_id: 'M1', tienda_id: 'MANDARINA', estado_pedido: 'PENDIENTE', fecha_pedido: '2026-10-02T10:00:00Z', monto_total: 10, monto_abonado: 0 },
      { pedido_id: 'I1', tienda_id: 'INDSTORE', estado_pedido: 'PENDIENTE', fecha_pedido: '2026-10-01T10:00:00Z', monto_total: 10, monto_abonado: 0 },
    ],
    detalle_pedido: [{ pedido_id: 'I1', producto_nombre: 'Polo', talla: 'L', color: 'Rojo', cantidad: 1 }],
    logs_pedidos: [{ pedido_id: 'I1', fecha: '2026-10-01T10:00:00Z', campo: 'CREACION', valor_despues: 'x' }],
    guias_despacho: [],
  })
  const r = await cargarPedidosParaIndi({ telefono: '0991234567' }, crm)
  assert.deepEqual(r.map((p) => p.id), ['I1'])
  assert.equal(r[0].prendas[0].nombre, 'Polo')
})

test('cargarPedidosParaIndi sin teléfono ni idVenta devuelve []', async () => {
  assert.deepEqual(await cargarPedidosParaIndi({ telefono: '' }, crmFalso({})), [])
  assert.deepEqual(await cargarPedidosParaIndi({}, crmFalso({})), [])
})

test('buscarPedidosCliente: mismos pedidos e ítems que la lógica de Ventas', async () => {
  const llamadas = []
  const crm = crmFalso({
    cliente_conversacion: [{ cliente_id: 'C1' }],
    clientes: [{ cliente_id: 'C2' }, { cliente_id: 'C1' }],
    pedidos: [{ pedido_id: 'A', cliente_id: 'C1' }],
    detalle_pedido: [
      { pedido_id: 'A', producto_nombre: 'X', eliminado: false, subestado: '' },
      { pedido_id: 'A', producto_nombre: 'Y', eliminado: true },
      { pedido_id: 'A', producto_nombre: 'Z', subestado: 'eliminado' },
    ],
  }, llamadas)
  const r = await buscarPedidosCliente(crm, { telefono: '+593 99 123 4567', idVenta: 'A' })
  assert.deepEqual(r.pedidos.map((p) => p.pedido_id), ['A'])
  assert.deepEqual(r.items.A.map((i) => i.producto_nombre), ['X'])
  const like = llamadas.find((q) => q.t === 'cliente_conversacion').filtros[0]
  assert.deepEqual(like, ['like', 'telefono', '%991234567'])
})

// Salida idéntica a la ruta de antes: se compara contra la lógica ORIGINAL de la
// ruta (copiada tal cual) sobre el mismo crm falso.
async function viejo(crm, telefono, idVenta) {
  const t9 = String(telefono || '').replace(/\D/g, '').slice(-9)
  const clienteIds = new Set()
  if (t9.length >= 8) {
    const [cc, cl] = await Promise.all([
      crm.from('cliente_conversacion').select('cliente_id').like('telefono', `%${t9}`),
      crm.from('clientes').select('cliente_id').like('celular', `%${t9}`),
    ])
    ;(cc.data || []).forEach(r => r.cliente_id && clienteIds.add(String(r.cliente_id)))
    ;(cl.data || []).forEach(r => r.cliente_id && clienteIds.add(String(r.cliente_id)))
  }
  const pedidos = []; const vistos = new Set()
  const push = (arr) => (arr || []).forEach(p => { const k = String(p.pedido_id || ''); if (k && !vistos.has(k)) { vistos.add(k); pedidos.push(p) } })
  if (clienteIds.size) push((await crm.from('pedidos').select('x').in('cliente_id', [...clienteIds])).data)
  if (idVenta) push((await crm.from('pedidos').select('x').eq('pedido_id', idVenta)).data)
  const items = {}
  if (pedidos.length) {
    const { data: det } = await crm.from('detalle_pedido').select('x').in('pedido_id', pedidos.map(p => String(p.pedido_id)))
    ;(det || []).forEach(d => {
      if (d.eliminado === true || String(d.subestado || '').toUpperCase() === 'ELIMINADO') return
      ;(items[d.pedido_id] ||= []).push({ producto: d.producto_nombre || '', talla: d.talla || '', color: d.color || '', cantidad: Number(d.cantidad || 1) || 1, precio: Number(d.precio_unit || d.subtotal || 0) || 0 })
    })
  }
  return { ids: pedidos.map(p => p.pedido_id), items }
}

test('buscarPedidosCliente da lo mismo que la ruta original', async () => {
  const crm = crmFalso({
    cliente_conversacion: [{ cliente_id: 'C1' }, { cliente_id: null }],
    clientes: [{ cliente_id: 'C2' }],
    pedidos: [{ pedido_id: 'A' }, { pedido_id: 'B' }, { pedido_id: 'A' }],
    detalle_pedido: [
      { pedido_id: 'A', producto_nombre: 'X', talla: 'M', color: 'Azul', cantidad: '3', precio_unit: '5.5' },
      { pedido_id: 'B', producto_nombre: 'Y', subtotal: 9, eliminado: true },
      { pedido_id: 'B', producto_nombre: 'Z', subestado: 'Eliminado' },
      { pedido_id: 'B', producto_nombre: 'W' },
    ],
  })
  const v = await viejo(crm, '0991234567', 'B')
  const n = await buscarPedidosCliente(crm, { telefono: '0991234567', idVenta: 'B' })
  assert.deepEqual(n.pedidos.map(p => p.pedido_id), v.ids)
  const mapa = Object.fromEntries(Object.entries(n.items).map(([k, arr]) => [k, arr.map(d => ({
    producto: d.producto_nombre || '', talla: d.talla || '', color: d.color || '',
    cantidad: Number(d.cantidad || 1) || 1, precio: Number(d.precio_unit || d.subtotal || 0) || 0 }))]))
  assert.deepEqual(mapa, v.items)
})

test('buscarPedidosCliente estricto: lanza si una consulta trae error; sin estricto lo ignora', async () => {
  const crm = { from: () => { const api = { select: () => api, like: () => api, in: () => api, eq: () => api,
    then: (res, rej) => Promise.resolve({ data: null, error: { message: 'caído' } }).then(res, rej) }; return api } }
  const r = await buscarPedidosCliente(crm, { telefono: '0991234567' })
  assert.deepEqual(r.pedidos, [])
  await assert.rejects(buscarPedidosCliente(crm, { telefono: '0991234567' }, { estricto: true }), /caído/)
  await assert.rejects(cargarPedidosParaIndi({ telefono: '0991234567' }, crm), /caído/)
})

test('conTope: si la promesa tarda más que el tope, rechaza con "tardó más de"', async () => {
  const lenta = new Promise((ok) => setTimeout(() => ok('tarde'), 200))
  await assert.rejects(conTope(lenta, 20, 'pedidos'), /pedidos tardó más de 20 ms/)
})

test('conTope: si llega antes, devuelve su valor y su error tal cual', async () => {
  assert.deepEqual(await conTope(Promise.resolve([1]), 50, 'pedidos'), [1])
  await assert.rejects(conTope(Promise.reject(new Error('base caída')), 50, 'pedidos'), /base caída/)
})
