import { NextResponse } from 'next/server'
import { getRespuestas, addRespuesta, editRespuesta, deleteRespuesta } from '@/lib/respuestas'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    return NextResponse.json(await getRespuestas())
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { accion, id, texto, imagenUrl, ...extras } = await req.json()
    // Aceptar acciones en español (las que manda RightPanel) e inglés
    const norm = {
      agregar: 'add', actualizar: 'edit', eliminar: 'delete',
      add: 'add', edit: 'edit', delete: 'delete',
    }[accion]
    if (norm === 'add') await addRespuesta(id, texto, imagenUrl, extras)
    else if (norm === 'edit') await editRespuesta(id, texto, imagenUrl, extras)
    else if (norm === 'delete') await deleteRespuesta(id)
    else return NextResponse.json({ error: `Accion desconocida: ${accion}` }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
