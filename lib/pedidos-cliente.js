// Busca los pedidos de un cliente en el CRM (schema `crm`): la MISMA lógica que
// usa el panel "Ventas" (/api/cliente-pedidos) y que ahora también usa Indi.
// Match del teléfono → cliente_id por dos vías:
//   · crm.cliente_conversacion.telefono  (formato inbox 593…, ya vinculado)
//   · crm.clientes.celular               (formato 09…)
// Ambos por los últimos 9 dígitos, que coinciden en los dos formatos.
// `crm` es el cliente Supabase ya apuntado al schema `crm` (se pasa de afuera
// para poder probarlo con uno falso).

const digits = (s) => String(s || '').replace(/\D/g, '')
export const tail9 = (s) => digits(s).slice(-9)

export const COLS_PEDIDO = 'pedido_id, cliente_id, fecha_pedido, estado_pedido, estado_pago, monto_total, tienda_id, monto_abonado, fecha_entrega_prometida, fecha_impresion_produccion, fecha_actualizacion, guia_numero, guia_transportista'
export const COLS_ITEM = 'pedido_id, producto_nombre, talla, color, cantidad, precio_unit, subtotal, eliminado, subestado, area, subestado_corte'

/** @returns {Promise<{ pedidos: object[], items: Record<string, object[]> }>} */
// `estricto`: si alguna consulta devuelve error, LANZA en vez de tratarlo como
// "sin pedidos". Lo usa Indi (un fallo no debe pasar por "no tiene pedidos");
// el panel Ventas sigue con el default y no cambia.
export async function buscarPedidosCliente(crm, { telefono = '', idVenta = '' } = {}, { estricto = false } = {}) {
  const fallo = (r, que) => { if (estricto && r?.error) throw new Error(`${que}: ${r.error.message}`) }
  const t9 = tail9(telefono)

  // 1) cliente_id(s) del teléfono (puente conversación→cliente + celular)
  const clienteIds = new Set()
  if (t9.length >= 8) {
    const [cc, cl] = await Promise.all([
      crm.from('cliente_conversacion').select('cliente_id').like('telefono', `%${t9}`),
      crm.from('clientes').select('cliente_id').like('celular', `%${t9}`),
    ])
    fallo(cc, 'cliente_conversacion'); fallo(cl, 'clientes')
    ;(cc.data || []).forEach(r => r.cliente_id && clienteIds.add(String(r.cliente_id)))
    ;(cl.data || []).forEach(r => r.cliente_id && clienteIds.add(String(r.cliente_id)))
  }

  // 2) pedidos por cliente_id, más el pedido cuyo id == idVenta guardado en el inbox
  const ids = [...clienteIds]
  const pedidos = []
  const vistos = new Set()
  const push = (arr) => (arr || []).forEach(p => {
    const k = String(p.pedido_id || '')
    if (k && !vistos.has(k)) { vistos.add(k); pedidos.push(p) }
  })
  if (ids.length) {
    const r = await crm.from('pedidos').select(COLS_PEDIDO).in('cliente_id', ids)
    fallo(r, 'pedidos')
    push(r.data)
  }
  if (idVenta) {
    const r = await crm.from('pedidos').select(COLS_PEDIDO).eq('pedido_id', idVenta)
    fallo(r, 'pedidos')
    push(r.data)
  }

  // 3) ítems por pedido (excluye eliminados)
  const pedidoIds = pedidos.map(p => String(p.pedido_id))
  const items = {}
  if (pedidoIds.length) {
    const rd = await crm.from('detalle_pedido').select(COLS_ITEM).in('pedido_id', pedidoIds)
    fallo(rd, 'detalle_pedido')
    ;(rd.data || []).forEach(d => {
      if (d.eliminado === true || String(d.subestado || '').toUpperCase() === 'ELIMINADO') return
      ;(items[d.pedido_id] ||= []).push(d)
    })
  }

  return { pedidos, items }
}
