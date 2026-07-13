import { NextResponse } from 'next/server'
import { readSheet, appendRow } from '@/lib/sheets'
import { registrarContactoEntrante } from '@/lib/contactos'
import { usaSupabaseLectura, dualWrite } from '@/lib/supabase'
import { existeWamidSupabase, guardarMensajeSupabase } from '@/lib/inbox-supabase'

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

// Extrae { tipo, contenido, mediaId } según el tipo de mensaje de Meta
function extraer(msg) {
  switch (msg.type) {
    case 'text':     return { tipo: 'texto',      contenido: msg.text?.body || '',            mediaId: '' }
    case 'image':    return { tipo: 'imagen',     contenido: msg.image?.caption || '',        mediaId: msg.image?.id || '' }
    case 'video':    return { tipo: 'video',      contenido: msg.video?.caption || '',        mediaId: msg.video?.id || '' }
    case 'audio':    return { tipo: 'audio',      contenido: '',                              mediaId: msg.audio?.id || '' }
    case 'document': return { tipo: 'documento',  contenido: msg.document?.filename || '',     mediaId: msg.document?.id || '' }
    case 'sticker':  return { tipo: 'sticker',    contenido: '',                              mediaId: msg.sticker?.id || '' }
    case 'button':   return { tipo: 'texto',      contenido: msg.button?.text || '',          mediaId: '' }
    case 'interactive': {
      const i = msg.interactive || {}
      const title = i.button_reply?.title || i.list_reply?.title || ''
      return { tipo: 'texto', contenido: title, mediaId: '' }
    }
    case 'location': {
      const l = msg.location || {}
      return { tipo: 'texto', contenido: `📍 ${l.latitude},${l.longitude} ${l.name || ''}`.trim(), mediaId: '' }
    }
    default:         return { tipo: msg.type || 'texto', contenido: '', mediaId: '' }
  }
}

// ── Recepción de mensajes (POST) ──────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const entries = body?.entry || []

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
          const { tipo, contenido, mediaId } = extraer(msg)
          nuevos.push({
            wamid: msg.id || '',
            telefono,
            nombre: nombreDe[telefono] || '',
            tipo, contenido, mediaId,
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
            direccion: 'ENTRANTE', mediaId: m.mediaId,
          }),
          'webhook.entrante',
        )
        // Upsert del contacto (no pisa nombre/alias editados a mano)
        try { await registrarContactoEntrante(m.telefono, m.nombre, m.telefono) }
        catch (e) { console.error('[/api/webhook] contacto:', e.message) }
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
