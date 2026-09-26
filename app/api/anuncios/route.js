import { NextResponse } from 'next/server'
import { getAnunciosResumen } from '@/lib/contactos'
import { completarAnunciosDesdeMeta } from '@/lib/anuncios-meta'
import { CUENTA } from '@/lib/supabase'

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
    // Nombre, campaña y estado desde el Administrador de anuncios (best-effort,
    // 10 por carga, tope 3 s): un anuncio nuevo aparece con su nombre real.
    await Promise.race([
      completarAnunciosDesdeMeta(CUENTA).catch((e) => console.warn('[/api/anuncios] Meta:', e.message)),
      new Promise((r) => setTimeout(r, 3000)),
    ])
    const anuncios = await getAnunciosResumen()
    return NextResponse.json({ ok: true, anuncios })
  } catch (err) {
    console.error('[/api/anuncios GET]', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
