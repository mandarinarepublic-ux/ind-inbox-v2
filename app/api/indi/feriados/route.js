// Días en que Indi avisa que no hay despacho (inbox.indi_feriados).
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { autorizar } from '@/lib/editor-indi'
import { validarFeriado, fechaReal, resultadoEscritura } from '@/lib/indi-validar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CUENTA_IND = 'IND'

export async function GET(req) {
  const { error: noAut } = await autorizar(req)
  if (noAut) return noAut
  try {
    const { data, error } = await getSupabase().from('indi_feriados').select('fecha,nombre')
      .eq('cuenta', CUENTA_IND).order('fecha').range(0, 999)
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  const { error: noAut } = await autorizar(req, { editar: true })
  if (noAut) return noAut
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getSupabase()
    if (body.accion === 'guardar') {
      const v = validarFeriado(body)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const { error } = await sb.from('indi_feriados').upsert({ cuenta: CUENTA_IND, fecha: v.fecha, nombre: v.nombre })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'borrar') {
      if (!fechaReal(body.fecha)) return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
      // Con `.select` se sabe si borró algo: 0 filas = ya no estaba (404, no "ok").
      const r = resultadoEscritura(
        await sb.from('indi_feriados').delete().eq('cuenta', CUENTA_IND).eq('fecha', body.fecha).select('fecha'),
        'Ese feriado ya no existe (quizá alguien lo borró antes)')
      return NextResponse.json(r.body, { status: r.status })
    }
    return NextResponse.json({ error: `Acción desconocida: ${body.accion}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
