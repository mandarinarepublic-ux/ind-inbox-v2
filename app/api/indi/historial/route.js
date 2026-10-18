// Quién cambió qué en Indi, y el botón de deshacer (inbox.indi_historial).
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { autorizar } from '@/lib/editor-indi'
import { operacionDeshacer } from '@/lib/indi-deshacer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CUENTA_IND = 'IND'

export async function GET(req) {
  const { error: noAut } = await autorizar(req)
  if (noAut) return noAut
  try {
    const { data, error } = await getSupabase().from('indi_historial').select('*')
      .eq('cuenta', CUENTA_IND).order('en', { ascending: false }).limit(100)
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  const { usuario, error: noAut } = await autorizar(req, { editar: true })
  if (noAut) return noAut
  try {
    const body = await req.json().catch(() => ({}))
    if (body.accion !== 'deshacer') return NextResponse.json({ error: `Acción desconocida: ${body.accion}` }, { status: 400 })
    const sb = getSupabase()
    const { data: fila, error: e1 } = await sb.from('indi_historial').select('*')
      .eq('cuenta', CUENTA_IND).eq('id', body.id).maybeSingle()
    if (e1) throw e1
    if (!fila) return NextResponse.json({ error: 'No existe ese cambio' }, { status: 404 })
    const op = operacionDeshacer(fila)
    if (!op) return NextResponse.json({ error: 'Este cambio no se puede deshacer' }, { status: 400 })

    // Siempre acotado a IND. El trigger anota el deshacer en el historial solo.
    const [col, val] = op.id !== undefined ? ['id', op.id] : ['fecha', op.fecha]
    const esConocimiento = op.tabla === 'indi_conocimiento'
    // `por` del historial sale de `actualizado_por`: así queda quién deshizo.
    const marca = esConocimiento ? { actualizado_por: usuario.nombre, actualizado_en: new Date().toISOString() } : {}
    if (op.tipo === 'restaurar' && !Object.keys(op.datos).length) {
      return NextResponse.json({ error: 'Ese cambio no tiene nada que deshacer' }, { status: 400 })
    }
    let resultado
    if (op.tipo === 'borrar') {
      // En un DELETE no hay fila nueva: se anota quién borra con un update previo
      // (el trigger no registra updates que solo cambian actualizado_por/en).
      if (esConocimiento) {
        const firma = await sb.from(op.tabla).update(marca).eq('cuenta', CUENTA_IND).eq(col, val)
        if (firma.error) throw firma.error
      }
      resultado = await sb.from(op.tabla).delete().eq('cuenta', CUENTA_IND).eq(col, val)
    } else if (op.tipo === 'reinsertar') {
      resultado = await sb.from(op.tabla).insert({ ...op.datos, cuenta: CUENTA_IND, ...marca })
    } else {
      resultado = await sb.from(op.tabla).update({ ...op.datos, ...marca }).eq('cuenta', CUENTA_IND).eq(col, val)
    }
    if (resultado.error) throw resultado.error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
