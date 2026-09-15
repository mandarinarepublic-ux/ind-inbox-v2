import { NextResponse } from 'next/server'
import { getAnunciosResumen } from '@/lib/contactos'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Anuncios vistos por el inbox de IND (de `inbox.anuncios`, con chats de 30 días),
// para elegirlos en el Disparador "Llega desde un anuncio" de FLUJOS. Detrás del
// login como todo lo del navegador.
//
// ⚠️ DIFERENCIA CON MANDI: acá solo hay GET. En MANDI también existe PATCH para
// ponerle etiqueta a un anuncio desde AUTOS; IND no tiene esa tarjeta.
export async function GET() {
  try {
    const anuncios = await getAnunciosResumen()
    return NextResponse.json({ ok: true, anuncios })
  } catch (err) {
    console.error('[/api/anuncios GET]', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
