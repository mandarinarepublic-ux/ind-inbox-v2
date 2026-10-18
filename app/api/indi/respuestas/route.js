// Qué respuestas rápidas puede usar Indi (inbox.respuestas_rapidas.uso_ia).
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { autorizar } from '@/lib/editor-indi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CUENTA_IND = 'IND'

export async function GET(req) {
  const { error: noAut } = await autorizar(req)
  if (noAut) return noAut
  try {
    const { data, error } = await getSupabase().from('respuestas_rapidas')
      .select('id,texto,grupo,imagenes,uso_ia').eq('cuenta', CUENTA_IND).eq('activo', true)
      .order('orden').range(0, 999)
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
    const { id, usoIa } = await req.json().catch(() => ({}))
    if (!id || typeof usoIa !== 'boolean') return NextResponse.json({ error: 'Faltan id y usoIa' }, { status: 400 })
    const { data, error } = await getSupabase().from('respuestas_rapidas')
      .update({ uso_ia: usoIa }).eq('cuenta', CUENTA_IND).eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'No existe esa respuesta' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
