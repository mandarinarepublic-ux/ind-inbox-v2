import { NextResponse } from 'next/server'

// TEMPORAL — borrar con el resto de rutas de diagnóstico al terminar.
//
// Solicita el NOMBRE VISIBLE de un número (va a revisión de Meta). Hace falta
// para poder migrar el número entre WABAs: Meta rechaza la migración con
// subcode 2388103 "El nombre registrado debe ser actual y estar aprobado"
// mientras el número tenga name_status = NON_EXISTS.
//
// GET  -> consulta el estado actual del nombre (sin tocar nada)
// POST -> envía el nombre nuevo a revisión
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v22.0'

const autorizado = (req) => {
  const clave = req.nextUrl.searchParams.get('clave') || ''
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  return claves.length > 0 && claves.includes(clave)
}

export async function GET(req) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  const phone = req.nextUrl.searchParams.get('phone') || ''
  if (!/^\d{5,25}$/.test(phone)) return NextResponse.json({ ok: false, error: 'phone invalido' }, { status: 400 })

  const r = await fetch(
    `${GRAPH}/${phone}?fields=id,display_phone_number,verified_name,name_status,new_name_status,status,quality_rating`,
    { headers: { Authorization: `Bearer ${META_TOKEN}` } },
  )
  return NextResponse.json({ ok: r.ok, http: r.status, body: await r.json().catch(() => ({})) })
}

export async function POST(req) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const phone = req.nextUrl.searchParams.get('phone') || ''
  if (!/^\d{5,25}$/.test(phone)) return NextResponse.json({ ok: false, error: 'phone invalido' }, { status: 400 })

  // El nombre va por cuerpo: es contenido, no un identificador, y así no queda
  // en los logs de acceso ni en el historial del navegador.
  const { nombre } = await req.json().catch(() => ({}))
  const limpio = String(nombre || '').trim()
  if (limpio.length < 3 || limpio.length > 75) {
    return NextResponse.json({ ok: false, error: 'nombre invalido (3-75 caracteres)' }, { status: 400 })
  }

  const r = await fetch(`${GRAPH}/${phone}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_display_name: limpio }),
  })
  const body = await r.json().catch(() => ({}))
  const e = body?.error || {}
  console.log(
    `[/api/admin/nombre-visible] phone=${phone} nombre="${limpio}" http=${r.status} ` +
    `code=${e.code} subcode=${e.error_subcode} msg=${e.message || 'OK'} fbtrace=${e.fbtrace_id || '—'}`
  )
  return NextResponse.json({ ok: r.ok, http: r.status, nombre: limpio, body }, { status: r.ok ? 200 : 502 })
}
