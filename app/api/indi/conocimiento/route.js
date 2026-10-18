// Lo que Indi sabe: precios, promos, reglas y preguntas frecuentes (inbox.indi_conocimiento).
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { autorizar } from '@/lib/editor-indi'
import { validarFila, hoyEcuador, resultadoEscritura } from '@/lib/indi-validar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CUENTA_IND = 'IND'

export async function GET(req) {
  const { error: noAut } = await autorizar(req)
  if (noAut) return noAut
  try {
    const { data, error } = await getSupabase().from('indi_conocimiento').select('*')
      .eq('cuenta', CUENTA_IND).order('tipo').order('orden').order('titulo').range(0, 999)
    if (error) throw error
    const hoy = hoyEcuador()
    // Las vencidas se devuelven igual, marcadas: el módulo las muestra apagadas.
    return NextResponse.json((data || []).map((f) => ({ ...f, vencida: !!f.vigente_hasta && f.vigente_hasta < hoy })))
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  const { usuario, error: noAut } = await autorizar(req, { editar: true })
  if (noAut) return noAut
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getSupabase()
    if (body.accion === 'guardar') {
      const v = validarFila(body.fila)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const fila = { ...v.fila, cuenta: CUENTA_IND, actualizado_por: usuario.nombre, actualizado_en: new Date().toISOString() }
      if (!fila.id) delete fila.id
      const { data, error } = await sb.from('indi_conocimiento').upsert(fila).select('*').single()
      if (error) throw error
      return NextResponse.json({ ok: true, fila: data })
    }
    if (body.accion === 'borrar') {
      if (!body.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
      // El trigger toma `por` de `actualizado_por` de la fila; en un DELETE no hay
      // fila nueva, así que se deja constancia de quién borra con un update previo.
      // Con `.select` se sabe si tocó algo: 0 filas = ya no estaba (404, no "ok").
      const NO_HAY = 'Eso ya no existe (quizá alguien lo borró antes)'
      const firma = resultadoEscritura(
        await sb.from('indi_conocimiento').update({ actualizado_por: usuario.nombre, actualizado_en: new Date().toISOString() })
          .eq('cuenta', CUENTA_IND).eq('id', body.id).select('id'),
        NO_HAY)
      if (firma.status !== 200) return NextResponse.json(firma.body, { status: firma.status })
      const r = resultadoEscritura(
        await sb.from('indi_conocimiento').delete().eq('cuenta', CUENTA_IND).eq('id', body.id).select('id'),
        NO_HAY)
      return NextResponse.json(r.body, { status: r.status })
    }
    return NextResponse.json({ error: `Acción desconocida: ${body.accion}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
