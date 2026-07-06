import { NextResponse } from 'next/server'
import { getMensajes } from '@/lib/mensajes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const mensajes = await getMensajes()
    return NextResponse.json(mensajes, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (err) {
    console.error('[/api/mensajes]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
