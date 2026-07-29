import { NextResponse } from 'next/server'
import { getContactos } from '@/lib/contactos'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    // Sin filtro de canal: la agenda es UNA sola, compartida por los dos numeros.
    const contactos = await getContactos(null)
    return NextResponse.json(contactos, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (err) {
    console.error('[/api/contactos]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
