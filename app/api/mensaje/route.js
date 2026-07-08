import { NextResponse } from 'next/server'
import { getMensajeById } from '@/lib/mensajes'

export const dynamic = 'force-dynamic'

// GET /api/mensaje?id=<wamid>
// Busca un mensaje por wamid (comparando por HASH) — para renderizar citas cuyo
// mensaje original quedó fuera de la ventana de polling.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const msg = await getMensajeById(id)
    return NextResponse.json(msg || null)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
