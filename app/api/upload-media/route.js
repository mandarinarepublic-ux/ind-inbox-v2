import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Sube un archivo (video/imagen) a la Graph API de Meta y devuelve su MediaID.
// El token vive SOLO en el servidor (env) — nunca viaja al navegador.
// Antes esto se hacía desde el cliente con el token hardcodeado en lib/api-client.js.
const META_TOKEN    = process.env.META_TOKEN || ''
const META_PHONE_ID = process.env.META_PHONE_ID || '1092674123940116'

export async function POST(req) {
  try {
    if (!META_TOKEN) return NextResponse.json({ error: 'META_TOKEN no configurado' }, { status: 500 })

    const form = await req.formData()
    const file = form.get('file')
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

    const fd = new FormData()
    fd.append('file', file, file.name || 'video.mp4')
    fd.append('messaging_product', 'whatsapp')

    const up   = await fetch(`https://graph.facebook.com/v19.0/${META_PHONE_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_TOKEN}` },
      body: fd,
    })
    const data = await up.json().catch(() => ({}))
    if (!data.id) return NextResponse.json({ error: data.error?.message || 'Upload fallido' }, { status: 502 })

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
