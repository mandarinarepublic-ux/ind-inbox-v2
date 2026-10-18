import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { buscarPedidosCliente } from '@/lib/pedidos-cliente'

// Historial de pedidos del cliente — FUENTE: Supabase, schema `crm` (pedidos /
// clientes / detalle_pedido / cliente_conversacion). NO Google Sheets (legado).
// La búsqueda (teléfono → cliente_id → pedidos e ítems) vive en
// lib/pedidos-cliente.js: la comparte Indi para ver lo mismo que este panel.
export const dynamic = 'force-dynamic'

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function fechaCorta(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const telefono = searchParams.get('telefono') || ''
  const idVenta  = String(searchParams.get('idVenta') || '').trim()
  if (!telefono && !idVenta) {
    return NextResponse.json({ error: 'Falta el parámetro telefono' }, { status: 400 })
  }

  try {
    const crm = getSupabase().schema('crm')
    const { pedidos, items } = await buscarPedidosCliente(crm, { telefono, idVenta })

    // Ventas muestra solo estos campos de cada ítem (el resto es para Indi).
    const itemsByPedido = {}
    for (const [pid, arr] of Object.entries(items)) {
      itemsByPedido[pid] = arr.map(d => ({
        producto: d.producto_nombre || '',
        talla:    d.talla || '',
        color:    d.color || '',
        cantidad: Number(d.cantidad || 1) || 1,
        precio:   Number(d.precio_unit || d.subtotal || 0) || 0,
      }))
    }

    const CRM_URL = (process.env.MANDARINACRM_URL || 'https://mandarina-pro-sales.vercel.app').replace(/\/$/, '')

    const out = pedidos
      .map(p => {
        const pid = String(p.pedido_id || '')
        return {
          id:         pid,
          fecha:      fechaCorta(p.fecha_pedido),
          _ts:        p.fecha_pedido ? new Date(p.fecha_pedido).getTime() : 0,
          estado:     p.estado_pedido || '',
          estadoPago: p.estado_pago || '',
          total:      Number(p.monto_total || 0) || 0,
          url:        pid ? `${CRM_URL}/dashboard/pedido/${encodeURIComponent(pid)}` : '',
          items:      itemsByPedido[pid] || [],
        }
      })
      .sort((a, b) => b._ts - a._ts)

    const totalGastado = out.reduce((s, p) => s + (p.total || 0), 0)

    return NextResponse.json({
      telefono,
      totalPedidos: out.length,
      totalGastado: Math.round(totalGastado * 100) / 100,
      pedidos: out.map(({ _ts, ...p }) => p),
    })
  } catch (err) {
    console.error('[/api/cliente-pedidos] (crm supabase):', err?.message || err)
    return NextResponse.json(
      { error: 'No se pudo leer el CRM (Supabase)', detalle: String(err?.message || err).slice(0, 200) },
      { status: 502 },
    )
  }
}
