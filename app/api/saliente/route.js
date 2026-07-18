import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { appendRow } from '@/lib/sheets'
import { dualWrite } from '@/lib/supabase'
import { guardarMensajeSupabase } from '@/lib/inbox-supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ── Envío DIRECTO a la Cloud API de Meta (sin Make) ───────────────────────────
// Recibe el mismo body que ya manda lib/api-client.js y lo traduce al payload de
// la Graph API. Luego registra la salida en la hoja MENSAJES (lo que antes hacía
// Make con un "Add Row"). Token y phone id viven SOLO server-side.
const META_TOKEN    = process.env.META_TOKEN || ''
// El número +593 99 995 3326 quedó DUPLICADO en dos WABAs. La que el token del
// system user SÍ controla es "IND STORE" (1003593902536446), phone id 1135333936337730.
// (La otra, "Indstore" 2151783152331852 / 1092674123940116, tiene el display name
// rechazado y el token no la alcanza.) Igual: setea META_PHONE_ID en Vercel.
const META_PHONE_ID = process.env.META_PHONE_ID || '1135333936337730'
const GRAPH_URL     = `https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`

const soloDigitos = (s) => String(s || '').replace(/\D/g, '')

// Traduce el body del cliente → { payload Graph, tipo, contenido, mediaUrl, mediaId }
function construir(body) {
  const to = soloDigitos(body.Telefono)

  // Plantilla (HSM) — único formato permitido FUERA de la ventana de 24h.
  if (body.TipoMensaje === 'template') {
    const name = body.TemplateName
    const code = body.TemplateLang || 'es'
    let bodyParams = [], headerParams = []
    try { bodyParams   = JSON.parse(body.TemplateBodyParams   || '[]') } catch {}
    try { headerParams = JSON.parse(body.TemplateHeaderParams || '[]') } catch {}
    const headerImage = body.TemplateHeaderImage || ''
    const components = []
    if (headerImage) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImage } }] })
    } else if (headerParams.length) {
      components.push({ type: 'header', parameters: headerParams.map((t) => ({ type: 'text', text: String(t) })) })
    }
    if (bodyParams.length) {
      components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) })
    }
    return {
      tipo: 'texto', // se registra como texto para que se vea en el hilo del chat
      contenido: body.TemplatePreview || `📋 Plantilla: ${name}`,
      mediaUrl: '', mediaId: '',
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name, language: { code }, ...(components.length ? { components } : {}) },
      },
    }
  }

  // Botones interactivos
  if (body.TipoMensaje === 'interactive_buttons') {
    let buttons = []
    try { buttons = JSON.parse(body.Botones || '[]') } catch {}
    // Botones en forma simple para la UI/persistencia: [{ id, title }].
    // (El payload de Meta usa { type:'reply', reply:{ id, title } }.)
    const botones = buttons.map(b => (b?.reply ? { id: b.reply.id, title: b.reply.title } : b))
    return {
      tipo: 'interactive',
      contenido: body.Cuerpo || '',
      botones,
      mediaUrl: '', mediaId: '',
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body.Cuerpo || '' },
          action: { buttons },
        },
      },
    }
  }

  // Video por MediaID (subido antes vía /api/upload-media)
  if (body.VideoMediaId) {
    return {
      tipo: 'video',
      contenido: '', mediaUrl: '', mediaId: body.VideoMediaId,
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'video',
        video: { id: body.VideoMediaId },
      },
    }
  }

  // Imagen por URL pública
  if (body.ImagenURL) {
    return {
      tipo: 'imagen',
      contenido: '', mediaUrl: body.ImagenURL, mediaId: '',
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: body.ImagenURL },
      },
    }
  }

  // Texto (por defecto)
  return {
    tipo: 'texto',
    contenido: body.Mensaje || '',
    mediaUrl: '', mediaId: '',
    payload: {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: body.Mensaje || '', preview_url: true },
    },
  }
}

export async function POST(req) {
  try {
    if (!META_TOKEN) {
      return NextResponse.json({ ok: false, error: 'META_TOKEN no configurado' }, { status: 500 })
    }
    const body = await req.json()
    const { payload, tipo, contenido, mediaUrl, mediaId, botones } = construir(body)

    const res  = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data?.messages?.[0]?.id) {
      const msg = data?.error?.message || `HTTP ${res.status}`
      console.error('[/api/saliente] Meta rechazó el envío:', msg)
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }

    const wamid = data.messages[0].id

    // Registrar la salida en MENSAJES en SEGUNDO PLANO (waitUntil): respondemos al
    // instante en cuanto Meta acepta, y la escritura a Sheets (lenta) no retrasa la
    // respuesta. A=ID B=Telefono C=Nombre D=Tipo E=Contenido F=MediaURL G=Fecha
    //  H=Direccion I=MediaID J=RespuestaIA K=FotoIA L=ContextoID M=Botones
    const fechaSal = new Date().toISOString()
    // Botones (interactivos) serializados para la columna M / campo Supabase.
    const botonesStr = botones && botones.length ? JSON.stringify(botones) : ''
    waitUntil(
      dualWrite(
        () => appendRow('MENSAJES', [
          wamid, soloDigitos(body.Telefono), body.Nombre || '', tipo, contenido, mediaUrl,
          fechaSal, 'SALIENTE', mediaId, '', '', '', botonesStr,
        ]),
        () => guardarMensajeSupabase({
          id: wamid, telefono: soloDigitos(body.Telefono), nombre: body.Nombre || '', tipo,
          mensaje: contenido, mediaUrl, timestamp: fechaSal, direccion: 'SALIENTE', mediaId,
          botones: botonesStr,
        }),
        'saliente',
      ).catch(e => console.error('[/api/saliente] Enviado pero no se pudo registrar:', e.message))
    )

    return NextResponse.json({ ok: true, wamid })
  } catch (err) {
    console.error('[/api/saliente]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
