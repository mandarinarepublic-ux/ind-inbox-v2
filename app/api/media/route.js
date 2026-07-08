import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Proxy de media ENTRANTE de Meta/WhatsApp.
// Las URLs de Meta (lookaside.fbsbx.com, mmg.whatsapp.net, …) exigen el token en la
// cabecera Authorization; un <img>/<a> del navegador no puede mandarlo. Este proxy
// lo baja server-side con META_TOKEN y lo re-sirve.
// Uso:  /api/media?url=<url de Meta>   ó   /api/media?id=<MediaID de WhatsApp>
const META_TOKEN = process.env.META_TOKEN || ''

export async function GET(req) {
  try {
    if (!META_TOKEN) return NextResponse.json({ error: 'META_TOKEN no configurado' }, { status: 500 })

    const { searchParams } = new URL(req.url)
    let target = searchParams.get('url') || ''
    const id   = searchParams.get('id') || ''

    // Si viene un MediaID, primero resolvemos su URL temporal vía Graph API.
    if (!target && id) {
      const metaRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${META_TOKEN}` },
      })
      const meta = await metaRes.json().catch(() => ({}))
      target = meta.url || ''
    }
    if (!target) return NextResponse.json({ error: 'Falta parámetro url o id' }, { status: 400 })

    const res = await fetch(target, { headers: { Authorization: `Bearer ${META_TOKEN}` } })
    if (!res.ok) return NextResponse.json({ error: `Media HTTP ${res.status}` }, { status: res.status })

    const buf = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // la media entrante no cambia
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
