import { NextResponse } from 'next/server'

// TEMPORAL — borrar junto con /api/diag-meta y /api/admin/suscribir-app.
//
// Envía UN mensaje de texto por un phone_id arbitrario, con el mismo token y la
// misma app que usa el inbox. Sirve para validar una WABA destino ANTES de
// migrarle el número de producción: si por acá sale y por la WABA rota no, queda
// probado que el problema es de esa cuenta y no del token, la app ni el código.
//
// POST a propósito: manda un WhatsApp de verdad a una persona de verdad.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v19.0'

export async function POST(req) {
  const clave = req.nextUrl.searchParams.get('clave') || ''
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  if (!claves.length || !claves.includes(clave)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const phoneId = req.nextUrl.searchParams.get('phone') || ''
  const para = (req.nextUrl.searchParams.get('para') || '').replace(/\D/g, '')
  const texto = req.nextUrl.searchParams.get('texto') || 'Prueba tecnica IND STORE'
  if (!/^\d{5,25}$/.test(phoneId)) return NextResponse.json({ ok: false, error: 'phone invalido' }, { status: 400 })
  if (!/^\d{8,20}$/.test(para))    return NextResponse.json({ ok: false, error: 'destino invalido' }, { status: 400 })

  const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'text',
      text: { body: texto },
    }),
  })
  const body = await r.json().catch(() => ({}))
  const e = body?.error || {}
  console.log(
    `[/api/admin/probar-envio] phone=${phoneId} http=${r.status} ` +
    `code=${e.code} subcode=${e.error_subcode} msg=${e.message || 'OK'} fbtrace=${e.fbtrace_id || '—'}`
  )
  return NextResponse.json({
    ok: r.ok,
    http: r.status,
    wamid: body?.messages?.[0]?.id || null,
    error: e.message ? { code: e.code, subcode: e.error_subcode, msg: e.message, fbtrace: e.fbtrace_id } : null,
  }, { status: r.ok ? 200 : 502 })
}
