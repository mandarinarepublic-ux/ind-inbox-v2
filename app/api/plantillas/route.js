import { NextResponse } from 'next/server'
import { getWabaId, GRAPH } from '@/lib/whatsapp'
import { wabaIdDePhoneId } from '@/lib/canales'
import { payloadCrearPlantillaCarrusel } from '@/lib/carrusel'
import { armarPlantilla } from '@/lib/plantilla-nueva'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Lista las PLANTILLAS aprobadas de tu WABA. Necesarias para escribir a un cliente
// FUERA de la ventana de 24h (Meta solo permite plantillas ahí). Reutiliza META_TOKEN.
// El WABA ID se descubre solo desde el token (lib/whatsapp), con override META_WABA_ID.
const META_TOKEN = process.env.META_TOKEN || ''

const contarVars = (txt) => {
  const m = String(txt || '').match(/\{\{\s*\d+\s*\}\}/g)
  return m ? new Set(m.map((s) => s.replace(/\D/g, ''))).size : 0
}

// Fila cruda de Meta → shape amigable para el selector de plantillas.
function simplificar(t) {
  const comps = Array.isArray(t.components) ? t.components : []
  const header = comps.find((c) => String(c.type).toUpperCase() === 'HEADER')
  const body   = comps.find((c) => String(c.type).toUpperCase() === 'BODY')
  const footer = comps.find((c) => String(c.type).toUpperCase() === 'FOOTER')
  const btns   = comps.find((c) => String(c.type).toUpperCase() === 'BUTTONS')
  const headerFormat = header ? String(header.format || 'TEXT').toUpperCase() : null
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    header: header ? {
      format: headerFormat,                 // TEXT | IMAGE | VIDEO | DOCUMENT
      text: headerFormat === 'TEXT' ? (header.text || '') : '',
      vars: headerFormat === 'TEXT' ? contarVars(header.text) : 0,
    } : null,
    bodyText: body?.text || '',
    bodyVars: contarVars(body?.text),       // cuántas variables {{n}} pedir al usuario
    footerText: footer?.text || '',
    buttons: Array.isArray(btns?.buttons) ? btns.buttons.map((b) => b.text || '') : [],
    // 🛍️ Carrusel de productos: no se manda desde este selector (pide productos),
    // sino desde el 🛍️ del chat. Ver lib/carrusel.js.
    carrusel: comps.some((c) => String(c.type).toUpperCase() === 'CAROUSEL'),
  }
}

export async function GET() {
  if (!META_TOKEN) return NextResponse.json({ ok: false, needsEnv: 'META_TOKEN', templates: [] })
  const { id: wabaId, error: wabaErr } = await getWabaId()
  if (!wabaId) return NextResponse.json({ ok: false, needsEnv: 'META_WABA_ID', wabaError: wabaErr, templates: [] })
  try {
    const url = `${GRAPH}/${wabaId}/message_templates` +
      `?fields=name,status,category,language,components&limit=200`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${META_TOKEN}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`
      console.error('[/api/plantillas] Meta:', msg)
      return NextResponse.json({ ok: false, error: msg, templates: [] }, { status: 502 })
    }
    const templates = (data?.data || [])
      .filter((t) => String(t.status).toUpperCase() === 'APPROVED')
      .map(simplificar)
    return NextResponse.json({ ok: true, templates })
  } catch (err) {
    console.error('[/api/plantillas]', err.message)
    return NextResponse.json({ ok: false, error: err.message, templates: [] }, { status: 500 })
  }
}

// POST /api/plantillas { canal, nombre, categoria, idioma, cuerpo, ejemplos[], pie, minutos }
//   → crea la plantilla en la WABA DE ESE NÚMERO; Meta la deja PENDIENTE de revisión.
// POST /api/plantillas { canal, tipo: 'carrusel_productos' } → la del carrusel (lib/carrusel.js).
// Hasta el 14-oct-2026 IND solo creaba la del carrusel; ahora usa el mismo
// armador que MANDI (lib/plantilla-nueva.js), con Autenticación para el club.
// ☠️ Sin caída a la WABA del token: una plantilla en la WABA equivocada no se ve
// en el canal que la necesita y no se puede mover.
export async function POST(req) {
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN no está configurado' }, { status: 500 })
  const datos = await req.json().catch(() => ({}))
  const wabaId = wabaIdDePhoneId(datos.canal || '')
  if (!wabaId) return NextResponse.json({ ok: false, error: `Canal desconocido: ${datos.canal || '(vacío)'}` }, { status: 400 })
  const armada = datos.tipo === 'carrusel_productos'
    ? { ok: true, payload: payloadCrearPlantillaCarrusel() }
    : armarPlantilla(datos)
  if (!armada.ok) return NextResponse.json({ ok: false, errores: armada.errores }, { status: 400 })
  const payload = armada.payload
  try {
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = data?.error || {}
      const msg = e.error_user_msg || e.message || `HTTP ${res.status}`
      console.error('[/api/plantillas POST] Meta:', msg, e.code, e.error_subcode)
      return NextResponse.json({ ok: false, error: msg, code: e.code, subcode: e.error_subcode }, { status: 502 })
    }
    return NextResponse.json({ ok: true, wabaId, nombre: payload.name, ...data })
  } catch (err) {
    console.error('[/api/plantillas POST]', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
