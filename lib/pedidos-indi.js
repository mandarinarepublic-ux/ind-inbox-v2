// Pedidos del cliente para Indi: los MISMOS que encuentra el panel "Ventas"
// (buscarPedidosCliente), traducidos a la etapa que ve el cliente
// (calcularEtapa, copia de la regla de la página /pedido).
import { getSupabase } from './supabase.js'
import { buscarPedidosCliente } from './pedidos-cliente.js'
import { calcularEtapa, ETAPAS_CLIENTE } from './crm-etapa-cliente.js'

const TIENDA_IND = 'INDSTORE'
const MAX_PEDIDOS = 5
const TZ = 'America/Guayaquil'

const fmtFecha = new Intl.DateTimeFormat('es-EC', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

const aFecha = (v) => {
  const t = v ? Date.parse(v) : NaN
  return Number.isNaN(t) ? null : new Date(t)
}

// Ecuador no tiene horario de verano: UTC-5 todo el año.
const finDelDiaEc = (d) => Date.parse(`${fmtDia.format(d)}T23:59:59.999-05:00`)

// Misma regla que tieneSaldoPendiente del CRM.
const saldoPendiente = (p) => {
  if (String(p?.estado_pago || '').toUpperCase() === 'PAGADO') return false
  return (Number(p?.monto_total) || 0) - (Number(p?.monto_abonado) || 0) >= 0.01
}

/** PURO. @returns {object} PedidoIndi */
export function pedidoParaIndi({ pedido, items = [], logs = [], guia = null, ahora = new Date() }) {
  const { etapa, cancelado } = calcularEtapa({ pedido, items, logs, guia, ahora })
  const prometida = aFecha(pedido?.fecha_entrega_prometida)
  const fechaPrometida = prometida ? fmtFecha.format(prometida).replace(',', '') : ''
  const atrasado = Boolean(prometida) && !cancelado && etapa != null && etapa < 3
    && ahora.getTime() > finDelDiaEc(prometida)
  const foto = String(guia?.foto || '')
  return {
    id: String(pedido?.pedido_id || ''),
    prendas: items.filter((i) => !i.eliminado).map((i) => ({
      nombre: i.producto_nombre || '', color: i.color || '', talla: i.talla || '', cantidad: Number(i.cantidad || 1) || 1,
    })),
    etapa,
    etapaNombre: etapa == null ? '' : ETAPAS_CLIENTE[etapa].nombre,
    cancelado,
    fechaPrometida,
    atrasado,
    saldoPendiente: saldoPendiente(pedido),
    guia: etapa != null && etapa >= 3 && guia?.numero
      ? { numero: guia.numero, transportista: guia.transportista || '', foto: foto.startsWith('https://') ? foto : '' }
      : null,
  }
}

/**
 * Pedidos de INDSTORE del cliente (los 5 más recientes) listos para Indi.
 * Sin teléfono ni idVenta → []. Los errores reales de la base SÍ suben (el
 * que llama los atrapa). `crm` es opcional: solo para pruebas.
 */
export async function cargarPedidosParaIndi({ telefono = '', idVenta = '' } = {}, crm = null) {
  if (!String(telefono || '').trim() && !String(idVenta || '').trim()) return []
  crm = crm || getSupabase().schema('crm')
  const { pedidos, items } = await buscarPedidosCliente(crm, { telefono, idVenta })
  const mios = pedidos
    .filter((p) => p.tienda_id === TIENDA_IND)
    .sort((a, b) => (Date.parse(b.fecha_pedido) || 0) - (Date.parse(a.fecha_pedido) || 0))
    .slice(0, MAX_PEDIDOS)
  if (!mios.length) return []
  const ids = mios.map((p) => String(p.pedido_id))

  const [lg, gu] = await Promise.all([
    crm.from('logs_pedidos').select('pedido_id, fecha, campo, valor_despues').in('pedido_id', ids),
    crm.from('guias_despacho').select('pedido_id, numero_guia, transportista, fecha_despacho, foto_guia_url').in('pedido_id', ids),
  ])
  if (lg.error) throw new Error(`logs_pedidos: ${lg.error.message}`)
  if (gu.error) throw new Error(`guias_despacho: ${gu.error.message}`)

  const logsPor = {}
  ;(lg.data || []).forEach((l) => (logsPor[l.pedido_id] ||= []).push({ fecha: l.fecha, campo: l.campo, despues: l.valor_despues }))
  const guiaPor = {} // la última por fecha_despacho
  ;(gu.data || []).forEach((g) => {
    if (!g.numero_guia) return
    const prev = guiaPor[g.pedido_id]
    if (!prev || (Date.parse(g.fecha_despacho) || 0) >= (Date.parse(prev.fecha) || 0)) {
      guiaPor[g.pedido_id] = { numero: g.numero_guia, transportista: g.transportista, fecha: g.fecha_despacho, foto: g.foto_guia_url }
    }
  })

  const ahora = new Date()
  return mios.map((p) => {
    const id = String(p.pedido_id)
    const guia = guiaPor[id]
      || (p.guia_numero ? { numero: p.guia_numero, transportista: p.guia_transportista, fecha: null, foto: null } : null)
    return pedidoParaIndi({ pedido: p, items: items[id] || [], logs: logsPor[id] || [], guia, ahora })
  })
}
