import { NextResponse } from 'next/server'
import { getContactos } from '@/lib/contactos'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const contactos = await getContactos()
    return NextResponse.json(contactos, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (err) {
    console.error('[/api/contactos]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
