import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { readSheet, appendRow } from '@/lib/sheets'
import { registrarContactoEntrante, getModoIA } from '@/lib/contactos'
import { usaSupabaseLectura, dualWrite } from '@/lib/supabase'
import { existeWamidSupabase, guardarMensajeSupabase, guardarEventoCrudoSupabase } from '@/lib/inbox-supabase'
import { archivarFoto } from '@/lib/media-archive'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ── Webhook de Meta/WhatsApp — RECEPCIÓN directa (reemplaza a Make) ────────────
// Meta llama aquí con cada mensaje entrante. Escribimos la fila en MENSAJES y
// hacemos upsert del contacto en CONTACTOS. El inbox sigue leyendo por polling.
//
// En Meta → WhatsApp → Configuration, apunta la Callback URL a:
//   https://<tu-app>.vercel.app/api/webhook
// y usa como Verify Token el valor de WHATSAPP_VERIFY_TOKEN.
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ''

// ── Auto-respuesta IA (indx-agent) — APAGADA por defecto ──────────────────────
// DOBLE CANDADO para responder automáticamente:
//   1) master switch  IA_AUTORESPUESTA='on'  (default OFF → nada auto-responde)
//   2) el chat en ModoIA='IA'  (se enciende por conversación desde el inbox)
// El agente DEVUELVE el texto; nosotros lo enviamos por /api/saliente (que lo manda
// a Meta y lo registra en inbox.mensajes → así Indi tiene memoria del hilo).
// Tolerante a BOM/espacios/mayúsculas (el `vercel env add` por PowerShell mete BOM).
const IA_ON     = String(process.env.IA_AUTORESPUESTA || '').replace(/[^a-z]/gi, '').toLowerCase() === 'on'
const AGENT_URL = process.env.INDX_AGENT_URL || 'https://indx-agent.vercel.app/api/agent'
const AGENT_KEY = process.env.INDX_AGENT_KEY || 'mandi_republic_2024'
const RE_IMG = /https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)]*)?/gi

async function enviarSaliente(origin, body) {
  return fetch(`${origin}/api/saliente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => console.error('[webhook IA] envío falló:', e.message))
}

async function responderConIA(origin, phone, name, message) {
  try {
    const r = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mandi-key': AGENT_KEY },
      body: JSON.stringify({ phone, name: name || '', message, source: 'webhook' }),
      signal: AbortSignal.timeout(28000),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) { console.error('[webhook IA] agente', r.status, data?.error || ''); return }
    const reply = String(data?.reply_clean || data?.reply || '').trim()
    if (!reply) return

    // Las URLs de imagen que Indi incluyó se envían como FOTOS aparte.
    const imagenes = [...new Set(reply.match(RE_IMG) || [])]
    let texto = reply
    for (const u of imagenes) texto = texto.split(u).join('')
    texto = texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    if (texto) await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', Mensaje: texto })
    for (const url of imagenes) {
      await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', ImagenURL: url })
    }
  } catch (e) {
    console.error('[webhook IA] agente falló:', e.message)
  }
}

// ── Verificación del webhook (GET) ────────────────────────────────────────────
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    // Meta espera el challenge en texto plano
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Normaliza el objeto `referral` de Meta (mensajes que entran desde un anuncio
// Click-to-WhatsApp). Devuelve null si no viene de una pauta.
function normalizarReferral(r) {
  if (!r || typeof r !== 'object') return null
  const out = {
    source_type:   r.source_type || '',   // 'ad' | 'post'
    source_id:     r.source_id || '',      // ID del anuncio (o del post)
    source_url:    r.source_url || '',     // link de la pauta
    headline:      r.headline || '',       // titular del anuncio
    body:          r.body || '',           // texto del anuncio
    media_type:    r.media_type || '',     // 'image' | 'video'
    image_url:     r.image_url || '',      // creativo (imagen)
    video_url:     r.video_url || '',      // creativo (video)
    thumbnail_url: r.thumbnail_url || '',  // miniatura del creativo
    ctwa_clid:     r.ctwa_clid || '',      // click id (Conversions API)
  }
  return Object.values(out).some(Boolean) ? out : null
}

// Extrae { tipo, contenido, mediaId, referral } según el tipo de mensaje de Meta
function extraer(msg) {
  const referral = normalizarReferral(msg.referral)
  const base = (o) => ({ ...o, referral })
  switch (msg.type) {
    case 'text':     return base({ tipo: 'texto',      contenido: msg.text?.body || '',            mediaId: '' })
    case 'image':    return base({ tipo: 'imagen',     contenido: msg.image?.caption || '',        mediaId: msg.image?.id || '' })
    case 'video':    return base({ tipo: 'video',      contenido: msg.video?.caption || '',        mediaId: msg.video?.id || '' })
    case 'audio':    return base({ tipo: 'audio',      contenido: '',                              mediaId: msg.audio?.id || '' })
    case 'document': return base({ tipo: 'documento',  contenido: msg.document?.filename || '',     mediaId: msg.document?.id || '' })
    case 'sticker':  return base({ tipo: 'sticker',    contenido: '',                              mediaId: msg.sticker?.id || '' })
    case 'button':   return base({ tipo: 'texto',      contenido: msg.button?.text || '',          mediaId: '' })
    case 'interactive': {
      const i = msg.interactive || {}
      const title = i.button_reply?.title || i.list_reply?.title || ''
      return base({ tipo: 'texto', contenido: title, mediaId: '' })
    }
    case 'location': {
      const l = msg.location || {}
      return base({ tipo: 'texto', contenido: `📍 ${l.latitude},${l.longitude} ${l.name || ''}`.trim(), mediaId: '' })
    }
    default:         return base({ tipo: msg.type || 'texto', contenido: '', mediaId: '' })
  }
}

// ── Recepción de mensajes (POST) ──────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const entries = body?.entry || []

    // Respaldo crudo (histórico tipo Make): guarda el POST COMPLETO tal cual llegó,
    // antes de parsear. En background: Meta recibe su 200 al instante. Best-effort.
    if (usaSupabaseLectura() && (body?.entry || []).length) {
      waitUntil(guardarEventoCrudoSupabase(body))
    }

    // Recolecta los mensajes entrantes (ignora statuses de entrega/lectura)
    const nuevos = []
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value    = change?.value || {}
        const contacts = value?.contacts || []
        const nombreDe = {}
        for (const c of contacts) nombreDe[c.wa_id] = c.profile?.name || ''

        for (const msg of value?.messages || []) {
          const telefono = String(msg.from || '')
          const { tipo, contenido, mediaId, referral } = extraer(msg)
          nuevos.push({
            wamid: msg.id || '',
            telefono,
            nombre: nombreDe[telefono] || '',
            tipo, contenido, mediaId, referral,
            raw: msg, // respaldo: objeto crudo del mensaje tal cual de Meta
            fecha: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          })
        }
      }
    }

    if (nuevos.length) {
      // Dedup por wamid: Meta reintenta la entrega, evita filas duplicadas.
      // En modo supabase se consulta por wamid en Supabase; si no, por la hoja MENSAJES.
      let vistos = null
      if (!usaSupabaseLectura()) {
        const rows = await readSheet('MENSAJES').catch(() => [])
        vistos = new Set(rows.map(r => String(r[0] || '')))
      }

      for (const m of nuevos) {
        if (m.wamid) {
          const dup = vistos ? vistos.has(m.wamid) : await existeWamidSupabase(m.wamid)
          if (dup) continue
          if (vistos) vistos.add(m.wamid)
        }
        // Escribe el mensaje entrante en el backend activo (+ espejo best-effort).
        // MENSAJES: A=ID B=Telefono C=Nombre D=Tipo E=Contenido F=MediaURL
        //           G=Fecha H=Direccion I=MediaID J=RespuestaIA K=FotoIA L=ContextoID
        await dualWrite(
          () => appendRow('MENSAJES', [
            m.wamid, m.telefono, m.nombre, m.tipo, m.contenido, '',
            m.fecha, 'ENTRANTE', m.mediaId, '', '', '',
          ]),
          () => guardarMensajeSupabase({
            id: m.wamid, telefono: m.telefono, nombre: m.nombre, tipo: m.tipo,
            mensaje: m.contenido, mediaUrl: '', timestamp: m.fecha,
            direccion: 'ENTRANTE', mediaId: m.mediaId, referral: m.referral, raw: m.raw,
          }),
          'webhook.entrante',
        )
        // Archivar la foto entrante a Supabase Storage (URL estable en media_url).
        // En background (no frena el 200 a Meta). Solo en modo supabase, donde la
        // fila ya quedó insertada por el dualWrite de arriba.
        if (usaSupabaseLectura() && (m.tipo === 'imagen' || m.tipo === 'sticker') && m.mediaId) {
          waitUntil(archivarFoto({ mediaId: m.mediaId, wamid: m.wamid }))
        }

        // Upsert del contacto (no pisa nombre/alias editados a mano)
        try { await registrarContactoEntrante(m.telefono, m.nombre, m.telefono) }
        catch (e) { console.error('[/api/webhook] contacto:', e.message) }

        // ── Auto-respuesta IA (doble candado) — solo TEXTO; media la ve un humano ──
        if (IA_ON && m.tipo === 'texto' && String(m.contenido || '').trim()) {
          const encendida = await getModoIA(m.telefono).catch(() => false)
          if (encendida) {
            const host  = req.headers.get('x-forwarded-host') || req.headers.get('host')
            const proto = req.headers.get('x-forwarded-proto') || 'https'
            // En segundo plano: Meta recibe su 200 al instante, la IA responde detrás.
            waitUntil(responderConIA(`${proto}://${host}`, m.telefono, m.nombre, m.contenido))
          }
        }
      }
    }

    // Meta exige 200 rápido o reintenta
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/webhook]', err)
    // Devolvemos 200 igual para que Meta no reintente en bucle por un fallo nuestro
    return NextResponse.json({ ok: false, error: err.message })
  }
}
