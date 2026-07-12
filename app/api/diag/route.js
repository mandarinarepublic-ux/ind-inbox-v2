import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// TEMPORAL — diagnóstico de credenciales Meta. Borrar tras usar.
// NO expone el token; solo dice si es válido y qué ve.
const META_TOKEN    = process.env.META_TOKEN || ''
const META_PHONE_ID = process.env.META_PHONE_ID || '1092674123940116'

async function graph(path) {
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${path}`, {
      headers: { Authorization: `Bearer ${META_TOKEN}` },
    })
    const body = await r.json().catch(() => ({}))
    return { status: r.status, body }
  } catch (e) {
    return { status: 0, error: e.message }
  }
}

export async function GET() {
  const out = {
    env: {
      META_TOKEN_set: !!META_TOKEN,
      META_TOKEN_len: META_TOKEN.length,
      META_TOKEN_prefix: META_TOKEN.slice(0, 6),
      META_PHONE_ID_usado: META_PHONE_ID,
      META_PHONE_ID_desde_env: !!process.env.META_PHONE_ID,
      WHATSAPP_VERIFY_TOKEN_set: !!process.env.WHATSAPP_VERIFY_TOKEN,
    },
    // /me → valida el token en sí
    me: await graph('me?fields=id,name'),
    // el nodo del phone id → valida que el token pueda usar ESE número
    phone: await graph(`${META_PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`),
    // DESCUBRIR el Phone Number ID correcto: WABAs asignadas a este system user
    wabas: await graph('me?fields=assigned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}'),
  }
  return NextResponse.json(out)
}
