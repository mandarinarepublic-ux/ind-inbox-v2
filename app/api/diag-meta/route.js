import { NextResponse } from 'next/server'

// Diagnóstico de la cuenta de WhatsApp en Meta. Solo lectura: NO envía nada.
// Existe porque cuando el inbox deja de enviar, el mensaje que Meta devuelve
// ("An unknown error has occurred.") no dice nada, y el token vive solo acá
// adentro. Protegido con MIG_KEY para que no quede abierto al mundo.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_TOKEN = process.env.META_TOKEN || ''
const PHONE = process.env.META_PHONE_ID || '1135333936337730'
const WABA = process.env.META_WABA_ID || '1003593902536446'
// El número +593 99 995 3326 está DUPLICADO en dos WABAs. Si la que usamos se
// rompe, hay que poder ver de una si la otra quedó viva: sería la salida para
// volver a despachar sin esperar a Meta.
const WABA_ALT = '2151783152331852'   // "Indstore"
const PHONE_ALT = '1092674123940116'
const GRAPH = 'https://graph.facebook.com/v22.0'

const tok = () => encodeURIComponent(META_TOKEN)

async function get(path) {
  try {
    const r = await fetch(`${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${tok()}`)
    return { http: r.status, body: await r.json().catch(() => ({})) }
  } catch (e) {
    return { http: 0, error: e.message }
  }
}

export async function GET(req) {
  const clave = req.nextUrl.searchParams.get('clave') || ''
  // Sin clave NO se corre nada. Este repo es PÚBLICO: dejar la ruta abierta (aunque
  // no devuelva el informe) permitía que cualquiera disparara llamadas contra la
  // Graph API de Meta con nuestro token. Sirve MIG_KEY o DIAG_KEY (esta última
  // existe para poder diagnosticar sin sacar MIG_KEY de su sitio).
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  if (!claves.length || !claves.includes(clave)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const camposNumero = 'id,display_phone_number,verified_name,quality_rating,status,name_status,code_verification_status,throughput,platform_type'
  const camposWaba = 'id,name,account_review_status,business_verification_status,status,ownership_type,currency,timezone_id'
  const [token, phone, waba, numeros, wabaAlt, phoneAlt, asignadas] = await Promise.all([
    get(`debug_token?input_token=${tok()}`),
    get(`${PHONE}?fields=${camposNumero},messaging_limit_tier`),
    get(`${WABA}?fields=${camposWaba}`),
    get(`${WABA}/phone_numbers?fields=id,display_phone_number,status,quality_rating,name_status`),
    get(`${WABA_ALT}?fields=${camposWaba}`),
    get(`${PHONE_ALT}?fields=${camposNumero}`),
    get(`me/assigned_whatsapp_business_accounts?fields=id,name,status`),
  ])

  const informe = {
    largoToken: META_TOKEN.length,
    phoneId: PHONE,
    wabaId: WABA,
    token, phone, waba, numeros,
    alterna: { wabaId: WABA_ALT, phoneId: PHONE_ALT, waba: wabaAlt, phone: phoneAlt },
    asignadas,
  }
  return NextResponse.json({ ok: true, ...informe })
}
