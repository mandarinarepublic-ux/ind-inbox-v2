import { NextResponse } from 'next/server'

// TEMPORAL — borrar junto con /api/diag-meta al terminar la migración del número.
//
// Suscribe NUESTRA app (la dueña del token) a una WABA. Hace falta para que el
// inbox pueda enviar por un número que vive en esa cuenta: sin la suscripción,
// el token lee los metadatos pero POST /messages falla.
//
// Es POST a propósito: una suscripción es una escritura en la cuenta de Meta y
// no puede dispararse por abrir una URL en el navegador.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v22.0'

export async function POST(req) {
  const clave = req.nextUrl.searchParams.get('clave') || ''
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  if (!claves.length || !claves.includes(clave)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const waba = req.nextUrl.searchParams.get('waba') || ''
  if (!/^\d{5,25}$/.test(waba)) {
    return NextResponse.json({ ok: false, error: 'waba invalida' }, { status: 400 })
  }

  const r = await fetch(`${GRAPH}/${waba}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}` },
  })
  const body = await r.json().catch(() => ({}))
  console.log(`[/api/admin/suscribir-app] waba=${waba} http=${r.status} ${JSON.stringify(body)}`)

  // Se devuelve el estado resultante para confirmar en el acto que quedó.
  const ver = await fetch(`${GRAPH}/${waba}/subscribed_apps?access_token=${encodeURIComponent(META_TOKEN)}`)
  const suscritas = await ver.json().catch(() => ({}))

  return NextResponse.json({ ok: r.ok, http: r.status, respuesta: body, suscritas }, { status: r.ok ? 200 : 502 })
}
