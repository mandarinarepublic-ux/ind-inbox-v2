import { NextResponse } from 'next/server'
import { catalogoDeCanal, CANALES } from '@/lib/canales'
import { productosParaCarrusel } from '@/lib/catalogo-lista'
import { getSupabase } from '@/lib/supabase'

// 🛍️ GET /api/catalogo-productos?canal=<phone_id> → productos para el carrusel de
// ESE número: solo con foto, publicados y con stock.
//
// Primero Meta (el carrusel exige el retailer_id EXACTO del catálogo). Si el token
// no ve el catálogo —ya pasó con los de IND, ver lib/catalogo.js—, cae al CRM de la
// tienda del número: el catálogo del 3326 usa ids de producto de Shopify, los
// mismos de crm.productos_shopify. Un producto del CRM que no esté en el catálogo
// lo rechaza Meta al enviar, y el error se muestra en la misma ventana.
export const dynamic = 'force-dynamic'

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v23.0'
const VIDA_MS = 10 * 60 * 1000
const cache = new Map()   // catalogId → { hasta, productos, total, fuente }

async function leerDeMeta(catalogId) {
  const filas = []
  let url = `${GRAPH}/${catalogId}/products?fields=retailer_id,name,price,image_url,availability,visibility&limit=100`
            + `&access_token=${encodeURIComponent(META_TOKEN)}`
  for (let i = 0; url && i < 10; i++) {           // tope: 1.000 productos
    const res = await fetch(url, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    // `fetch` no lanza con 4xx: sin esto un token sin permiso se leería como "catálogo vacío".
    if (!res.ok) throw new Error(d?.error?.message || `Meta respondió ${res.status}`)
    filas.push(...(d.data || []))
    url = d?.paging?.next || ''
  }
  return filas
}

async function leerDelCRM(tienda) {
  const { data, error } = await getSupabase().schema('crm').from('productos_shopify')
    .select('id, title, price, image, activo').eq('tienda', tienda)
  if (error) throw new Error(error.message)
  return (data || [])
    .filter((p) => p.activo !== false)
    .map((p) => ({
      retailer_id: String(p.id), name: p.title, image_url: p.image || '',
      price: p.price != null && p.price !== '' ? `$${Number(p.price).toFixed(2).replace('.', ',')}` : '',
    }))
}

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams
    const canal = params.get('canal') || CANALES[0].phoneId
    const cat = catalogoDeCanal(canal)
    if (!cat) return NextResponse.json({ error: 'Este número no tiene un catálogo de WhatsApp conectado: el carrusel sale por el 3326.' }, { status: 409 })
    const fresco = params.get('fresco') === '1'
    let c = cache.get(cat.catalogId)
    if (fresco || !c || c.hasta < Date.now()) {
      let filas, fuente = 'meta'
      try {
        if (!META_TOKEN) throw new Error('Falta META_TOKEN')
        filas = await leerDeMeta(cat.catalogId)
      } catch (e) {
        if (!cat.catalogoCRM) throw e
        console.warn('[/api/catalogo-productos] Meta no deja leer el catálogo, se usa el CRM:', e.message)
        filas = await leerDelCRM(cat.catalogoCRM)
        fuente = 'crm'
      }
      c = { hasta: Date.now() + VIDA_MS, productos: productosParaCarrusel(filas), total: filas.length, fuente }
      cache.set(cat.catalogId, c)
    }
    return NextResponse.json(
      { productos: c.productos, totalCatalogo: c.total, catalogId: cat.catalogId, fuente: c.fuente },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[/api/catalogo-productos]', err)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
