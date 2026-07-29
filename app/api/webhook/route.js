import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { registrarContactoEntrante, getModoIA, getContactos, marcarPush } from '@/lib/contactos'
import { enviarPush, cuerpoDeMensaje, debeNotificar } from '@/lib/push'
import { usaSupabaseLectura } from '@/lib/supabase'
import { existeWamidSupabase, guardarMensajeSupabase, guardarEventoCrudoSupabase, actualizarEstadoEntregaSupabase, asegurarConversacionSalienteSupabase } from '@/lib/inbox-supabase'
import { archivarMedia } from '@/lib/media-archive'
import { getAutomatizaciones } from '@/lib/automatizaciones'
import { decidirIA } from '@/lib/ia-canal'
import { extraer } from '@/lib/wa-mensaje'
import { extraerEchoes } from '@/lib/echoes'

const tail9 = (s) => String(s || '').replace(/\D/g, '').slice(-9)

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
// Candados para responder automáticamente, en serie:
//   1) master switch  IA_AUTORESPUESTA='on'  (default OFF → nada auto-responde)
//      Este switch NO se toca acá: sigue siendo el interruptor de arriba de todo.
//   2) el CORTAFUEGOS por número (config.ia.principal/secundario, lib/ia-canal.js)
//   3) el chat en ModoIA='IA'  (se enciende por conversación desde el inbox)
// Los puntos 2 y 3 los resuelve `decidirIA` (lib/ia-canal.js); `agenteResponde`
// de abajo es el único lugar que junta eso con el master switch.
// El agente DEVUELVE el texto; nosotros lo enviamos por /api/saliente (que lo manda
// a Meta y lo registra en inbox.mensajes → así Indi tiene memoria del hilo).
// Tolerante a BOM/espacios/mayúsculas (el `vercel env add` por PowerShell mete BOM).
const IA_ON     = String(process.env.IA_AUTORESPUESTA || '').replace(/[^a-z]/gi, '').toLowerCase() === 'on'
const AGENT_URL = process.env.INDX_AGENT_URL || 'https://indx-agent.vercel.app/api/agent'
const AGENT_KEY = process.env.INDX_AGENT_KEY || 'mandi_republic_2024'
const RE_IMG = /https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)]*)?/gi

// `auto: true` marca que el envío NO lo hizo un humano (IA, saludo automático).
// /api/saliente lo usa para no reiniciar el enfriamiento del aviso push: si la IA
// está llevando el chat, no hay que empezar a interrumpir al humano.
//
// `Canal` es OBLIGATORIO: hay que responder por el MISMO número al que el cliente
// escribió. Sin él /api/saliente cae al número principal, y como el cliente nunca
// escribió a ese número la ventana de 24 h está cerrada → el envío FALLA y el
// cliente no recibe nada. Paso el 28-jul: 57 de 69 saludos perdidos.
async function enviarSaliente(origin, body) {
  return fetch(`${origin}/api/saliente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, auto: true }),
  }).catch(e => console.error('[webhook IA] envío falló:', e.message))
}

async function responderConIA(origin, phone, name, message, canal) {
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

    if (texto) await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', Mensaje: texto, Canal: canal })
    for (const url of imagenes) {
      await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', ImagenURL: url, Canal: canal })
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

// ── Recepción de mensajes (POST) ──────────────────────────────────────────────
// Read receipts: procesa los value.statuses[] de Meta (sent/delivered/read/failed)
// y actualiza estado_entrega del mensaje saliente por wamid. Solo en modo supabase.
async function procesarStatuses(statuses) {
  if (!usaSupabaseLectura()) return
  for (const s of statuses) {
    await actualizarEstadoEntregaSupabase(s.wamid, s.estado)
      .catch(e => console.error('[webhook status]', e.message))
  }
}

// Echoes: lo que se responde DESDE EL CELULAR llega de vuelta por el webhook.
// Carril MÍNIMO a propósito: guardar el mensaje y archivar el medio. Nada de
// saludos, IA, push ni cambios de estado — un echo no es un cliente escribiendo,
// es nuestra propia respuesta. Por eso no pasa por el bucle de arriba, que es
// donde vive todo eso: así no hay nada que acordarse de excluir.
// Un echo que falle no debe tumbar el resto del lote (try/catch por fila).
async function procesarEchoes(echoes) {
  for (const e of echoes) {
    try {
      if (await existeWamidSupabase(e.wamid).catch(() => false)) continue
      await asegurarConversacionSalienteSupabase(e.telefono)
      await guardarMensajeSupabase({
        id: e.wamid, telefono: e.telefono, nombre: '', tipo: e.tipo,
        mensaje: e.contenido, mediaUrl: '', timestamp: e.fecha,
        direccion: 'SALIENTE', mediaId: e.mediaId, contextoId: e.contextoId,
        raw: e.raw, phoneId: e.phoneId,
      })
      if (e.mediaId) await archivarMedia({ mediaId: e.mediaId, wamid: e.wamid }).catch(() => {})
    } catch (err) {
      console.error('[/api/webhook echo]', e.wamid, err.message)
    }
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const entries = body?.entry || []
    const _host  = req.headers.get('x-forwarded-host') || req.headers.get('host')
    const _proto = req.headers.get('x-forwarded-proto') || 'https'
    const origin = `${_proto}://${_host}`

    // Respaldo crudo (histórico tipo Make): guarda el POST COMPLETO tal cual llegó,
    // antes de parsear. En background: Meta recibe su 200 al instante. Best-effort.
    if (usaSupabaseLectura() && (body?.entry || []).length) {
      waitUntil(guardarEventoCrudoSupabase(body))
    }

    // Recolecta los mensajes entrantes + los statuses de entrega (✓✓)
    const nuevos = []
    const statuses = [] // read receipts: {wamid, estado}
    const echoes = []
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value    = change?.value || {}

        // Lo que se manda desde el CELULAR viene en value.message_echoes, no en
        // value.messages, y con `to`/`from` al revés. Carril aparte: el `continue`
        // garantiza que no toque nada del camino de los entrantes (si siguiera de
        // largo, el echo se guardaría con el teléfono equivocado: en un echo,
        // `from` somos nosotros, no el cliente).
        if (change?.field === 'smb_message_echoes') {
          echoes.push(...extraerEchoes(value))
          continue
        }

        // Por cuál de NUESTROS números entró esto. Con un solo número daba igual;
        // con dos es lo único que permite separar las bandejas y saber por dónde
        // responder. Meta ya lo manda en cada evento y hasta ahora lo tirábamos.
        const phoneId  = value?.metadata?.phone_number_id || ''
        const contacts = value?.contacts || []
        const nombreDe = {}
        for (const c of contacts) nombreDe[c.wa_id] = c.profile?.name || ''

        // Estados de entrega (✓✓) de mensajes que ENVIAMOS.
        for (const st of value?.statuses || []) {
          if (st?.id && st?.status) statuses.push({ wamid: String(st.id), estado: String(st.status).toLowerCase() })
        }

        for (const msg of value?.messages || []) {
          const telefono = String(msg.from || '')
          const { tipo, contenido, mediaId, contextoId, referral } = extraer(msg)
          nuevos.push({
            wamid: msg.id || '',
            telefono,
            nombre: nombreDe[telefono] || '',
            tipo, contenido, mediaId, contextoId, referral, phoneId,
            raw: msg, // respaldo: objeto crudo del mensaje tal cual de Meta
            fecha: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          })
        }
      }
    }

    if (nuevos.length) {
      // Dedup por wamid: Meta reintenta la entrega, evita filas duplicadas.
      // Se consulta por wamid en Supabase.
      const vistos = null

      // ── Saludos automáticos: config + SNAPSHOT de contactos leído ANTES de
      // guardar los mensajes de este lote (para detectar "nuevo" y "reactivación").
      const auto = await getAutomatizaciones().catch(() => null)
      // `null` = TODOS los números. El webhook NO es una bandeja: atiende lo que
      // entre por cualquier canal, así que su agenda tiene que ser completa.
      //
      // Con el default (solo el 3326) un contacto del 9804 no aparecía nunca en
      // esta lista y esNuevoDe() daba siempre true: lo saludaba como nuevo EN CADA
      // MENSAJE. El 28-jul un solo cliente recibió 11 saludos seguidos — spam puro,
      // con riesgo de que Meta bloquee el número.
      const contactosSnap = await getContactos(null).catch(() => [])
      const contactoDe = (phone) => contactosSnap.find(c => tail9(c.telefono) === tail9(phone))
      const esNuevoDe = (phone) => !contactoDe(phone)
      const ultimoEntranteAtDe = (phone) => { const c = contactoDe(phone); return c?.ultimoEntranteAt ? new Date(c.ultimoEntranteAt).getTime() : 0 }
      // ¿el bot va a contestar por este número/chat? `phoneId` = por cuál canal
      // entro (reja del cortafuegos); `decidirIA` aplica canal Y chat, en ese orden.
      // IA_ON manda primero: si el master switch está OFF, nada de lo de abajo importa.
      const agenteResponde = (phone, phoneId) => IA_ON && decidirIA({ config: auto, phoneId, contacto: contactoDe(phone) })
      const saludados = new Set()

      // ── Aviso push de mensaje nuevo ──────────────────────────────────────────
      // Último aviso enviado por conversación (del snapshot de este ciclo).
      const ultimoPushAtDe = (phone) => {
        const c = contactosSnap.find(c => tail9(c.telefono) === tail9(phone))
        return c?.ultimoPushAt || null
      }
      // Anti doble-aviso dentro del mismo lote: el snapshot no se entera de lo que
      // acabamos de mandar hace dos mensajes.
      const avisados = new Set()

      // Nunca lanza: un fallo acá no puede tocar el webhook. Sin claves VAPID,
      // enviarPush es un no-op silencioso.
      async function avisarSiCorresponde(m) {
        const t = tail9(m.telefono)
        if (avisados.has(t)) return
        if (!debeNotificar(ultimoPushAtDe(m.telefono), Date.now())) return
        avisados.add(t)
        const nombre = m.nombre || m.telefono
        await enviarPush({
          titulo: `💬 ${nombre}`,
          cuerpo: cuerpoDeMensaje({ tipo: m.tipo, contenido: m.contenido }),
          url:    `/inbox?tel=${encodeURIComponent(m.telefono)}`,
          tag:    `chat-${t}`,
          tel:    m.telefono,
        })
        await marcarPush(m.telefono)
      }
      async function saludarSiCorresponde(phone, name, canal) {
        if (!auto || agenteResponde(phone, canal)) return // si el bot responde, él saluda → evita doble msg
        const t = tail9(phone)
        if (saludados.has(t)) return
        if (esNuevoDe(phone)) {
          const s = auto.saludo_nuevo
          if (s?.activo && String(s.texto || '').trim()) { saludados.add(t); await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', Mensaje: s.texto.trim(), Canal: canal }) }
          return
        }
        const s = auto.saludo_reactivacion
        if (s?.activo && String(s.texto || '').trim()) {
          const horas = Number(s.horas) || 12
          const prevMs = ultimoEntranteAtDe(phone)
          if (prevMs && Date.now() - prevMs >= horas * 3600 * 1000) { saludados.add(t); await enviarSaliente(origin, { Telefono: phone, Nombre: name || '', Mensaje: s.texto.trim(), Canal: canal }) }
        }
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
        await guardarMensajeSupabase({
          id: m.wamid, telefono: m.telefono, nombre: m.nombre, tipo: m.tipo,
          mensaje: m.contenido, mediaUrl: '', timestamp: m.fecha,
          direccion: 'ENTRANTE', mediaId: m.mediaId, contextoId: m.contextoId,
          referral: m.referral, raw: m.raw, phoneId: m.phoneId,
        })
        // Archivar el adjunto entrante a Supabase Storage (URL estable en media_url).
        // En background (no frena el 200 a Meta). Solo en modo supabase, donde la
        // fila ya quedó insertada por guardarMensajeSupabase arriba.
        // CUALQUIER media, no solo fotos: antes esto era `imagen || sticker` y por
        // eso los audios y videos se quedaron colgando del media_id de Meta. Cuando
        // el número se rompió (27-jul) su API de media empezó a devolver 500 y esos
        // archivos se perdieron para siempre. Lo que no está en nuestro Storage no
        // es nuestro.
        if (usaSupabaseLectura() && m.mediaId) {
          waitUntil(archivarMedia({ mediaId: m.mediaId, wamid: m.wamid }))
        }

        // Upsert del contacto (no pisa nombre/alias editados a mano)
        try { await registrarContactoEntrante(m.telefono, m.nombre, m.telefono) }
        catch (e) { console.error('[/api/webhook] contacto:', e.message) }

        // Aviso al equipo. Va DESPUÉS de registrarContactoEntrante para que la
        // conversación exista y se le pueda escribir ultimo_push_at.
        await avisarSiCorresponde(m)
          .catch(e => console.error('[/api/webhook] aviso push:', e.message))

        // Saludo automático (bienvenida a nuevo / "hola de vuelta" al reactivarse).
        // En background: no frena el 200 a Meta. Solo dispara si el bot NO va a responder.
        waitUntil(saludarSiCorresponde(m.telefono, m.nombre, m.phoneId).catch(e => console.error('[/api/webhook] saludo:', e.message)))

        // ── Auto-respuesta IA — solo TEXTO; media la ve un humano ──
        // `agenteResponde` ya aplica master switch + cortafuegos por canal + chat
        // (con el snapshot de contactos de este ciclo). `getModoIA` de abajo es un
        // SEGUNDO candado que relee la base ahora mismo: no se saca, es la
        // protección que ya existía contra que el snapshot quede desactualizado.
        if (agenteResponde(m.telefono, m.phoneId) && m.tipo === 'texto' && String(m.contenido || '').trim()) {
          const encendida = await getModoIA(m.telefono).catch(() => false)
          if (encendida) {
            // En segundo plano: Meta recibe su 200 al instante, la IA responde detrás.
            waitUntil(responderConIA(origin, m.telefono, m.nombre, m.contenido, m.phoneId))
          }
        }
      }
    }

    // Read receipts (✓✓): actualizar estado de entrega en background.
    if (statuses.length) waitUntil(procesarStatuses(statuses))
    // Echoes (respuesta desde el celular): guardar + archivar medio, en background.
    if (echoes.length && usaSupabaseLectura()) waitUntil(procesarEchoes(echoes))

    // Meta exige 200 rápido o reintenta
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/webhook]', err)
    // Devolvemos 200 igual para que Meta no reintente en bucle por un fallo nuestro
    return NextResponse.json({ ok: false, error: err.message })
  }
}
