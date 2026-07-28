import { NextResponse } from 'next/server'

// Diagnóstico de la cuenta de WhatsApp en Meta. Solo lectura: NO envía nada.
// Existe porque cuando el inbox deja de enviar, el mensaje que Meta devuelve
// ("An unknown error has occurred.") no dice nada, y el token vive solo acá
// adentro. Protegido con MIG_KEY para que no quede abierto al mundo.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_TOKEN = process.env.META_TOKEN || ''
const PHONE = process.env.META_PHONE_ID || '1135333936337730'
const WABA_DEFECTO = process.env.META_WABA_ID || '1003593902536446'
// OJO: acá se consultaba también la WABA duplicada ("Indstore" 2151783152331852 /
// phone 1092674123940116) por si quedaba viva como salida alterna. Ya se comprobó
// el 27-jul que el token NO la alcanza: devuelve code 100 subcode 33 en cada
// llamada y eso ensucia el panel de la app con errores "Invalid ID" que no
// significan nada. No volver a agregarlo.
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
  // ?waba=<id> permite auditar CUALQUIER cuenta antes de mover el número a ella.
  // Conectar el número a una WABA que también está rota costaría el número.
  const WABA = req.nextUrl.searchParams.get('waba') || WABA_DEFECTO
  const [token, phone, waba, numeros, asignadas, appsSuscritas, yo] = await Promise.all([
    get(`debug_token?input_token=${tok()}`),
    get(`${PHONE}?fields=${camposNumero},messaging_limit_tier`),
    get(`${WABA}?fields=${camposWaba}`),
    get(`${WABA}/phone_numbers?fields=id,display_phone_number,status,quality_rating,name_status`),
    get(`me/assigned_whatsapp_business_accounts?fields=id,name,status`),
    // ¿Qué app está suscrita a ESTA WABA? Si nuestra app (IND STORE API,
    // 1536330231408825) no aparece acá, no puede enviar por su número por más que
    // el token lea los metadatos sin problema.
    get(`${WABA}/subscribed_apps`),
    get('me?fields=id,name'),
  ])

  const informe = {
    largoToken: META_TOKEN.length,
    phoneId: PHONE,
    wabaId: WABA,
    token, phone, waba, numeros, asignadas, appsSuscritas, yo,
  }
  return NextResponse.json({ ok: true, ...informe })
}
