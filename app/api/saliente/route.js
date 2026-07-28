import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { guardarMensajeSupabase } from '@/lib/inbox-supabase'
import { limpiarPush } from '@/lib/contactos'
import { resolverMediaId, invalidarMediaId, esErrorDeMediaId, urlLiviana, META_PHONE_ID } from '@/lib/media-id'

export const dynamic = 'force-dynamic'
export const revalidate = 0
// Sin esto la función se queda con el default (10 s) y una foto pesada se corta a
// medio camino: Vercel mata el proceso y el vendedor cree que la mandó.
export const maxDuration = 60

// ── Envío DIRECTO a la Cloud API de Meta (sin Make) ───────────────────────────
// Recibe el mismo body que ya manda lib/api-client.js y lo traduce al payload de
// la Graph API. Luego registra la salida en la hoja MENSAJES (lo que antes hacía
// Make con un "Add Row"). Token y phone id viven SOLO server-side.
const META_TOKEN = process.env.META_TOKEN || ''
// El número +593 99 995 3326 quedó DUPLICADO en dos WABAs. La que el token del
// system user SÍ controla es "IND STORE" (1003593902536446), phone id 1135333936337730.
// (La otra, "Indstore" 2151783152331852 / 1092674123940116, tiene el display name
// rechazado y el token no la alcanza.) Igual: setea META_PHONE_ID en Vercel.
// El valor se importa de lib/media-id: la caché de media_id se indexa por ese mismo
// número, así que tiene que ser exactamente el mismo en los dos lados.
const GRAPH_URL = `https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`

const soloDigitos = (s) => String(s || '').replace(/\D/g, '')

// La conversión URL → media_id (descarga + subida a Meta + caché) vive en
// lib/media-id.js: la comparten esta ruta y /api/media/precache.

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
      // Meta baja esta imagen por su cuenta: si es un PNG gigante de Shopify la
      // rechaza. Le pedimos la versión liviana, igual que en los envíos normales.
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: urlLiviana(headerImage) } }] })
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

  // Video por URL pública (Supabase Storage). El navegador sube el archivo DIRECTO
  // a Supabase (sin el muro de 4.5 MB de Vercel) y Meta lo descarga del link.
  // Permite hasta 16 MB. Supabase es un host confiable → Meta no falla al bajarlo.
  if (body.VideoURL) {
    return {
      tipo: 'video',
      contenido: '', mediaUrl: body.VideoURL, mediaId: '',
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'video',
        video: { link: body.VideoURL },
      },
    }
  }

  // Imagen por MediaID (subida antes vía /api/media/upload — camino sin terceros)
  if (body.ImagenMediaId) {
    return {
      tipo: 'imagen',
      contenido: '',
      mediaUrl: body.ImagenURL || '',   // url pública solo para pintar el hilo
      mediaId: body.ImagenMediaId,
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { id: body.ImagenMediaId },
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
    const construido = construir(body)
    const { payload, tipo, contenido, mediaUrl, botones } = construido
    let mediaId = construido.mediaId

    // ── Responder citando un mensaje ─────────────────────────────────────────
    // Meta acepta `context.message_id` en CUALQUIER tipo de mensaje, así que se
    // agrega acá una sola vez en vez de en cada rama de construir().
    const contextoId = String(body.ContextoId || '').trim()
    if (contextoId) payload.context = { message_id: contextoId }

    // Imagen por link (respuestas rápidas, catálogo, fotos ya subidas a imgbb):
    // la convertimos a media id ANTES de enviar, así Meta no descarga de terceros.
    // `resolverMediaId` primero mira la caché: si esta foto ya se subió alguna vez,
    // no se descarga ni se re-sube nada y el envío sale en milisegundos.
    // Si la conversión falla, seguimos con el link de siempre (mejor eso que nada).
    let urlOrigen = ''   // url de la que salió el media id, por si hay que invalidarlo
    if (payload.type === 'image' && payload.image?.link) {
      urlOrigen = payload.image.link
      try {
        const id = await resolverMediaId(urlOrigen)
        payload.image = { id }
        mediaId = id
      } catch (e) {
        // Una foto demasiado grande tampoco se puede mandar por link: Meta la
        // baja y la rechaza. Mejor avisar que fingir que se envió.
        if (e.demasiadoGrande) {
          console.error('[/api/saliente] imagen rechazada por tamaño:', e.message)
          return NextResponse.json(
            { ok: false, error: `No se pudo enviar la foto: ${e.message}. Súbela más liviana.` },
            { status: 502 },
          )
        }
        console.error('[/api/saliente] no se pudo subir la imagen a Meta, se envía por link:', e.message)
      }
    }

    const enviar = () => fetch(GRAPH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    let res  = await enviar()
    let data = await res.json().catch(() => ({}))

    // El media id que teníamos guardado ya no le sirve a Meta (caducó, o lo borró).
    // Lo sacamos de la caché, subimos la foto de nuevo y reintentamos UNA vez: para
    // el vendedor esto es invisible, solo tarda como antes.
    if (!res.ok && urlOrigen && esErrorDeMediaId(data)) {
      console.warn('[/api/saliente] media id vencido, se re-sube la foto:', urlOrigen)
      await invalidarMediaId(META_PHONE_ID, urlOrigen)
      try {
        const id = await resolverMediaId(urlOrigen)
        payload.image = { id }
        mediaId = id
        res  = await enviar()
        data = await res.json().catch(() => ({}))
      } catch (e) {
        console.error('[/api/saliente] re-subida tras media id vencido falló:', e.message)
      }
    }

    // LA CITA NUNCA PUEDE COSTAR UN ENVÍO. Si Meta la rechaza (mensaje viejo, id que
    // ya no reconoce), reintentamos UNA vez sin ella: al cliente le llega la respuesta
    // sin el recuadrito, que es infinitamente mejor a que no le llegue nada.
    let citaAplicada = Boolean(contextoId)
    if (!res.ok && contextoId && payload.context) {
      console.warn('[/api/saliente] Meta rechazó la cita, se reenvía sin ella:', data?.error?.message || `HTTP ${res.status}`)
      delete payload.context
      citaAplicada = false
      res  = await enviar()
      data = await res.json().catch(() => ({}))
    }

    if (!res.ok || !data?.messages?.[0]?.id) {
      const e = data?.error || {}
      const msg = e.message || `HTTP ${res.status}`
      // "Meta rechazó el envío" a secas no alcanza para arreglar nada: sin el code /
      // subcode / details no se distingue un token vencido de un problema de pago o
      // de un número bloqueado. Se registra TODO lo que Meta manda.
      console.error(
        `[/api/saliente] Meta rechazó el envío — http=${res.status} code=${e.code} subcode=${e.error_subcode} ` +
        `type=${e.type} msg=${msg} details=${e.error_data?.details || '—'} title=${e.error_user_title || '—'} ` +
        `user_msg=${e.error_user_msg || '—'} fbtrace=${e.fbtrace_id || '—'} | tipo=${payload.type} to=${payload.to}`
      )
      return NextResponse.json({ ok: false, error: msg, code: e.code, subcode: e.error_subcode }, { status: 502 })
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
      guardarMensajeSupabase({
        id: wamid, telefono: soloDigitos(body.Telefono), nombre: body.Nombre || '', tipo,
        mensaje: contenido, mediaUrl, timestamp: fechaSal, direccion: 'SALIENTE', mediaId,
        botones: botonesStr,
        // Solo si la cita SALIÓ de verdad: si Meta la rechazó y reenviamos sin ella,
        // guardarla pintaría en el hilo una cita que el cliente nunca vio.
        contextoId: citaAplicada ? contextoId : '',
      }).catch(e => console.error('[/api/saliente] Enviado pero no se pudo registrar:', e.message))
    )

    // Contestar reinicia el enfriamiento del aviso: si ya respondiste, el próximo
    // mensaje del cliente es información nueva y DEBE avisar, aunque el aviso
    // anterior haya sido hace un minuto.
    // Los envíos automáticos (IA, saludos) mandan auto:true y NO lo reinician: si la
    // IA está llevando ese chat, no hay que interrumpir al humano.
    if (!body.auto) {
      waitUntil(
        limpiarPush(soloDigitos(body.Telefono))
          .catch(e => console.error('[/api/saliente] limpiar enfriamiento push:', e.message))
      )
    }

    // citaOmitida = el mensaje SÍ se envió, pero sin la cita. La UI lo avisa.
    return NextResponse.json({ ok: true, wamid, citaOmitida: Boolean(contextoId) && !citaAplicada })
  } catch (err) {
    console.error('[/api/saliente]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
