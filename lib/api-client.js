// lib/api-client.js — IND Store Inbox
// (Sin secretos: el token de Meta vive server-side en /api/upload-media y /api/media.)

import { CANALES, CANAL_POR_DEFECTO, phoneIdDeCanal } from './canales.js'

// ── Canal activo (qué número se está atendiendo) ─────────────────────────────
// Vive a nivel de módulo a propósito: hay una decena de puntos de envío y de
// lectura, y pasar el canal por parámetro en todos era invitar a que alguno se
// olvidara y mandara por el número equivocado. La App lo fija al cambiar de
// bandeja y todo lo de abajo lo usa solo.
let CANAL_ACTIVO = phoneIdDeCanal(CANAL_POR_DEFECTO)

export function setCanalActivo(idLogico) {
  CANAL_ACTIVO = phoneIdDeCanal(idLogico)
}
export function getCanalActivo() { return CANAL_ACTIVO }
export { CANALES }

// GET con cache-busting (Next 14 + navegador no deben cachear datos en vivo)
async function getJSON(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${path}${sep}t=${Date.now()}`, { cache: 'no-store' })
  return res.json()
}

// Devuelven null EN ERROR (no []) para distinguir "error" de "vacío real":
// así App.load() conserva los datos previos y el panel no parpadea a blanco.
export async function fetchRows() {
  try { return await getJSON('/api/mensajes') }
  catch { return null }
}
// Lista lateral: último mensaje de cada conversación (todo el historial).
export async function fetchLista() {
  try { return await getJSON('/api/lista') }
  catch { return null }
}
// Historial completo de UN chat (se pide al abrirlo).
export async function fetchHilo(telefono, limite = 800) {
  try { return await getJSON(`/api/hilo?phone=${encodeURIComponent(telefono)}&limite=${limite}&canal=${CANAL_ACTIVO}`) }
  catch { return null }
}
// Búsqueda de texto server-side, sobre todo el historial.
export async function buscarEnMensajes(q) {
  try { return await getJSON(`/api/buscar?q=${encodeURIComponent(q)}`) }
  catch { return null }
}
export async function fetchContacts() {
  try { return await getJSON('/api/contactos') }
  catch { return null }
}
// Sync unificado: UN request por ciclo de polling (antes 3: lista+mensajes+contactos).
// SIN cache-buster ni no-store → deja que el edge (s-maxage) sirva una respuesta
// compartida entre pestañas. null en error → App.load() conserva lo previo.
export async function fetchInboxSync({ sinCache = false } = {}) {
  try {
    // `canal` va en la URL para que el caché del edge separe una bandeja de otra.
    // `sinCache` agrega un parámetro único: el edge no tiene esa entrada y se ve
    // obligado a ir al origen. Se usa tras un cambio, para no leer una respuesta
    // vieja que revierta en pantalla lo que el vendedor acaba de hacer.
    const extra = sinCache ? `&t=${Date.now()}` : ''
    const res = await fetch(`/api/inbox-sync?canal=${CANAL_ACTIVO}${extra}`,
      sinCache ? { cache: 'no-store' } : undefined)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()   // { lista, rows, contactos }
  } catch { return null }
}
export async function fetchRepliesFromSheet() {
  try { return await getJSON('/api/respuestas') }
  catch { return [] }
}
// Catálogo de la pestaña TIENDA. fuente='shopify' (online) | 'sucursal' (inventario físico).
// Sin `q` trae todo; el buscador filtra en el cliente.
export async function fetchProductos(q = '', fuente = 'shopify') {
  try {
    const params = new URLSearchParams()
    if (fuente && fuente !== 'shopify') params.set('fuente', fuente)
    if (q) params.set('q', q)
    const qs = params.toString()
    const d = await getJSON(`/api/tienda${qs ? `?${qs}` : ''}`)
    return d.products || []
  } catch { return [] }
}

async function patchContacto(telefono, campo, valor) {
  try {
    const res = await fetch('/api/contactos/estado', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, campo, valor }),
    })
    return { ok: res.ok }
  } catch { return { ok: false } }
}

export async function updateContact(telefono, nombre, estado, alias, forzarEstado = false, modo = null) {
  await patchContacto(telefono, 'estado', estado)
  if (modo !== null) await patchContacto(telefono, 'modoIA', modo)
  if (alias) await patchContacto(telefono, 'alias', alias)
}
export async function toggleIAMode(telefono, nombre, estado, alias, modoIA) {
  return patchContacto(telefono, 'modoIA', modoIA ? 'IA' : 'HUMANO')
}
export async function saveNotes(telefono, nombre, notas) {
  return patchContacto(telefono, 'notas', notas)
}
export async function setIdVenta(telefono, idVenta) {
  return patchContacto(telefono, 'idVenta', idVenta)
}
// Eje 2: temperatura del lead (manual). '' / null limpia la clasificación.
export async function updateTemperatura(telefono, temperatura) {
  return patchContacto(telefono, 'temperatura', temperatura || '')
}

export async function writeReply(accion, reply) {
  try {
    const res = await fetch('/api/respuestas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, id: reply.id, texto: reply.text,
        imagenUrl: reply.imageUrl || '', imagenUrl2: reply.imageUrl2 || '',
        imagenUrl3: reply.imageUrl3 || '', imagenUrl4: reply.imageUrl4 || '',
        imagenUrl5: reply.imageUrl5 || '', imagenUrl6: reply.imageUrl6 || '',
        imagenUrl7: reply.imageUrl7 || '', imagenUrl8: reply.imageUrl8 || '',
        imagenUrl9: reply.imageUrl9 || '', imagenUrl10: reply.imageUrl10 || '',
        botones: Array.isArray(reply.botones) ? reply.botones : [],
      }),
    })
    return { ok: res.ok }
  } catch { return { ok: false } }
}

/** Guarda el orden completo de las respuestas rapidas. `ids` en su nuevo orden. */
export async function reorderReplies(ids) {
  try {
    const res = await fetch('/api/respuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reordenar', ids }),
    })
    return { ok: res.ok }
  } catch (err) {
    console.error('[api-client] reorderReplies:', err)
    return { ok: false }
  }
}

async function postSaliente(body) {
  try {
    const res = await fetch('/api/saliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, Canal: CANAL_ACTIVO }),
    })
    // Se devuelve el cuerpo para no perder avisos del servidor (p. ej. `citaOmitida`:
    // el mensaje salió pero sin la cita porque Meta la rechazó).
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: true, ...data }
    }
    // Propagamos el motivo real (p. ej. Meta rechaza el formato del video) para
    // poder mostrarlo en la UI en vez de un genérico "Error al enviar".
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || `HTTP ${res.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}

// `contextoId` opcional: wamid del mensaje que se está citando (responder a…).
export const sendReply = (t, n, m, contextoId = '') =>
  postSaliente({ Telefono: t, Nombre: n, Mensaje: m, ...(contextoId ? { ContextoId: contextoId } : {}) })
// `mediaId` opcional: si ya lo tenemos pre-resuelto (ver precacheMedia), el envío
// se salta la descarga + subida a Meta y sale en milisegundos.
export const sendImageUrl = (t, n, u, mediaId = '') =>
  postSaliente({ Telefono: t, Nombre: n, ImagenURL: u, ...(mediaId ? { ImagenMediaId: mediaId } : {}) })

/**
 * Pre-resuelve varias fotos a media_id de Meta, todas en paralelo y de una sola
 * llamada. Devuelve { url: mediaId }; las que no se pudieron resolver no vienen y
 * se mandan por url como siempre. Nunca lanza: es una optimización, no un paso
 * obligatorio del envío.
 */
export async function precacheMedia(urls) {
  const lista = (urls || []).filter(Boolean)
  if (!lista.length) return {}
  try {
    const res  = await fetch('/api/media/precache', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // El media_id pertenece al número que lo sube: hay que pre-resolver contra
      // el canal activo o Meta rechaza el envío.
      body: JSON.stringify({ urls: lista, canal: CANAL_ACTIVO }),
    })
    const data = await res.json().catch(() => ({}))
    return data?.ids || {}
  } catch (err) {
    console.error('[api-client] precacheMedia:', err)
    return {}
  }
}

// Envía una foto del computador SIN depender de que Meta pueda descargarla de un
// hosting externo: sube el archivo a Meta (media id) y manda por id. `imageUrl` es
// la url permanente (Supabase Storage) que solo sirve para pintar el hilo; puede ir vacía.
export async function sendImageFile(telefono, nombre, file, imageUrl = '') {
  try {
    const fd = new FormData()
    fd.append('file', file, file.name || 'imagen.jpg')
    const up = await (await fetch('/api/upload-media', { method: 'POST', body: fd })).json()
    if (!up.id) throw new Error(up.error || 'Upload fallido')
    return postSaliente({ Telefono: telefono, Nombre: nombre, ImagenMediaId: up.id, ImagenURL: imageUrl })
  } catch (err) {
    console.error('[api-client] sendImageFile:', err)
    // Último recurso: si teníamos url pública, que el servidor intente por ahí.
    if (imageUrl) return postSaliente({ Telefono: telefono, Nombre: nombre, ImagenURL: imageUrl })
    return { ok: false, error: err.message }
  }
}
export async function sendInteractiveButtons(t, n, body, buttons) {
  return postSaliente({ Telefono: t, Nombre: n, TipoMensaje: 'interactive_buttons',
    Cuerpo: body, Botones: JSON.stringify(buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))) })
}
// WhatsApp Cloud API: límite duro de 16 MB para video.
const MAX_VIDEO_BYTES = 16 * 1024 * 1024

// Detecta el códec de video leyendo el fourcc del contenedor MP4/MOV.
// WhatsApp SOLO acepta H.264 ('avc1'); si el video es HEVC/H.265 ('hvc1'/'hev1')
// Meta lo acepta y luego lo marca failed (error 131053). iPhone y muchos Android
// graban en HEVC por defecto, así que lo detectamos ANTES de enviar para avisar.
// Devuelve 'hevc' | 'h264' | 'unknown' (unknown = dejamos pasar, mejor intentar).
async function sniffVideoCodec(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    const has = (sig) => {
      const first = sig.charCodeAt(0)
      for (let i = 0; i + 4 <= buf.length; i++) {
        if (buf[i] !== first) continue
        if (buf[i+1] === sig.charCodeAt(1) && buf[i+2] === sig.charCodeAt(2) && buf[i+3] === sig.charCodeAt(3)) return true
      }
      return false
    }
    if (has('hvc1') || has('hev1')) return 'hevc'
    if (has('avc1') || has('avc3')) return 'h264'
    return 'unknown'
  } catch { return 'unknown' }
}

// Envía un video subiéndolo DIRECTO del navegador a Supabase Storage (esquiva el
// muro de ~4.5 MB de las funciones de Vercel) y luego se lo manda a Meta por LINK
// público. Así funciona con videos reales de celular, hasta 16 MB.
export async function sendVideo(telefono, nombre, videoFile) {
  try {
    if (videoFile.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: 'El video supera el límite de 16 MB de WhatsApp' }
    }
    // WhatsApp solo acepta H.264. Si es HEVC/H.265 avisamos ANTES de enviar
    // (si no, Meta lo acepta y lo marca failed después, sin que se note el motivo).
    if (await sniffVideoCodec(videoFile) === 'hevc') {
      return { ok: false, error: 'Video en formato HEVC/H.265: WhatsApp no lo acepta. Convertilo a MP4 (H.264) y reenvialo.' }
    }
    const contentType = videoFile.type || 'video/mp4'

    // 1) Pedimos al servidor una URL firmada de subida (request chico: NO sube el
    //    archivo por Vercel, solo pide el permiso).
    const signed = await (await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, size: videoFile.size }),
    })).json()
    if (!signed.uploadUrl) throw new Error(signed.error || 'No se pudo preparar la subida')

    // 2) Subimos el archivo DIRECTO a Supabase por la URL firmada. Replicamos el
    //    formato que usa el SDK de Supabase: PUT multipart con el archivo en el
    //    campo vacío ('') + cacheControl.
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', videoFile, videoFile.name || 'video.mp4')
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'true' },
      body: form,
    })
    if (!put.ok) {
      const detalle = await put.text().catch(() => '')
      throw new Error(`No se pudo subir el video (HTTP ${put.status}) ${detalle.slice(0, 140)}`.trim())
    }

    // 3) Enviamos a Meta por link público (Meta descarga el video de Supabase).
    return postSaliente({ Telefono: telefono, Nombre: nombre, VideoURL: signed.publicUrl })
  } catch (err) {
    console.error('[api-client] sendVideo:', err)
    return { ok: false, error: err.message }
  }
}
// ── CONTACTOS (directorio) + PLANTILLAS + AUTOMATIZACIONES ────────
export async function fetchDirectorio() {
  try { return await getJSON('/api/directorio') }
  catch { return { ok: false, contactos: [] } }
}
export async function fetchPlantillas() {
  try { return await getJSON('/api/plantillas') }
  catch { return { ok: false, templates: [] } }
}
export async function sendTemplate(telefono, nombre, tpl) {
  try {
    const res = await fetch('/api/saliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Canal: CANAL_ACTIVO,
        Telefono: telefono, Nombre: nombre || '',
        TipoMensaje: 'template',
        TemplateName: tpl.name, TemplateLang: tpl.language,
        TemplateBodyParams: JSON.stringify(tpl.bodyParams || []),
        TemplateHeaderParams: JSON.stringify(tpl.headerParams || []),
        TemplateHeaderImage: tpl.headerImage || '',
        TemplatePreview: tpl.preview || `📋 Plantilla: ${tpl.name}`,
      }),
    })
    return await res.json().catch(() => ({ ok: res.ok }))
  } catch (err) { return { ok: false, error: err.message } }
}
export async function getAutomatizaciones() {
  try { return await getJSON('/api/automatizaciones') }
  catch { return { ok: false, config: null } }
}
export async function saveAutomatizaciones(patch) {
  try {
    const res = await fetch('/api/automatizaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return await res.json().catch(() => ({ ok: res.ok }))
  } catch (err) { return { ok: false, error: err.message } }
}

export const isDemo = () => false
