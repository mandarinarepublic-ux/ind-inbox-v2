import { NextResponse } from 'next/server'
import { getSupabase, CUENTA } from '@/lib/supabase'

// RESCATE DE MEDIA — temporal, borrar cuando termine.
//
// Meta va a borrar y recrear el número. Todo lo que exista SOLO como `media_id`
// (audios, videos, fotos y documentos que mandaron los clientes) vive únicamente
// en los servidores de Meta y muere con el número. Esto lo baja y lo deja en
// nuestro bucket `inbox-media` con URL estable, igual que lib/media-archive.js
// pero cubriendo TODOS los tipos, no solo imágenes.
//
// Idempotente: salta lo que ya tiene media_url. Se llama por tandas.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v19.0'
const BUCKET = 'inbox-media'

// Meta devuelve el mime real; esto solo elige la extensión del archivo.
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr',
  'audio/aac': 'aac', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const safeName = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_')

async function rescatar(sb, fila) {
  const { mensaje_id, media_id, wa_message_id, tipo } = fila
  // 1) El media_id no caduca, pero la URL que devuelve sí: se pide fresca.
  const metaRes = await fetch(`${GRAPH}/${media_id}`, {
    headers: { Authorization: `Bearer ${META_TOKEN}` },
  })
  if (!metaRes.ok) {
    const j = await metaRes.json().catch(() => ({}))
    return { ok: false, motivo: `lookup ${metaRes.status} ${j?.error?.message || ''}`.trim() }
  }
  const meta = await metaRes.json()
  if (!meta?.url) return { ok: false, motivo: 'sin url' }

  // 2) Bajar el binario (Meta exige el token en el header).
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${META_TOKEN}` } })
  if (!bin.ok) return { ok: false, motivo: `download ${bin.status}` }
  const contentType = (bin.headers.get('content-type') || meta.mime_type || 'application/octet-stream')
    .split(';')[0].trim()
  const ext = EXT[contentType] || 'bin'
  const buf = Buffer.from(await bin.arrayBuffer())

  // 3) Subir al bucket público.
  const nombre = safeName(wa_message_id || `id${mensaje_id}`)
  const path = `${CUENTA}/${nombre}.${ext}`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true })
  if (upErr) return { ok: false, motivo: `upload ${upErr.message}` }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
  if (!pub?.publicUrl) return { ok: false, motivo: 'sin url publica' }

  // 4) Dejar la URL estable en el mensaje.
  const { error: updErr } = await sb
    .from('mensajes').update({ media_url: pub.publicUrl }).eq('mensaje_id', mensaje_id)
  if (updErr) return { ok: false, motivo: `update ${updErr.message}` }

  return { ok: true, tipo, bytes: buf.length, url: pub.publicUrl }
}

export async function GET(req) {
  const clave = req.nextUrl.searchParams.get('clave') || ''
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  if (!claves.length || !claves.includes(clave)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const limite = Math.min(Number(req.nextUrl.searchParams.get('limite') || 25), 40)
  const sb = getSupabase()

  const { data: filas, error } = await sb
    .from('mensajes')
    .select('mensaje_id, media_id, wa_message_id, tipo, direccion, fecha')
    .eq('cuenta', CUENTA)
    .not('media_id', 'is', null)
    .neq('media_id', '')
    .or('media_url.is.null,media_url.eq.')
    .order('fecha', { ascending: false })
    .limit(limite)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!filas?.length) return NextResponse.json({ ok: true, pendientes: 0, mensaje: 'nada que rescatar' })

  // En serie a propósito: son pocos y no queremos que Meta nos limite por ráfaga.
  const salvados = [], perdidos = []
  for (const f of filas) {
    let r
    try { r = await rescatar(sb, f) } catch (e) { r = { ok: false, motivo: e.message } }
    const info = { tipo: f.tipo, direccion: f.direccion, fecha: f.fecha, mensaje_id: f.mensaje_id }
    if (r.ok) salvados.push({ ...info, bytes: r.bytes })
    else perdidos.push({ ...info, motivo: r.motivo })
  }

  return NextResponse.json({
    ok: true,
    procesados: filas.length,
    salvados: salvados.length,
    perdidos: perdidos.length,
    detalle_perdidos: perdidos,
  })
}
