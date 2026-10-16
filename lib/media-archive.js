// lib/media-archive.js — Archiva media ENTRANTE de WhatsApp a Supabase Storage.
//
// Al recibir una foto, Meta solo nos da un `media_id` temporal (caduca ~30 días y
// exige el token para bajarse). Este módulo baja el binario UNA vez y lo guarda en
// nuestro bucket público `inbox-media`, dejando una URL ESTABLE en
// inbox.mensajes.media_url. Desde ahí el CRM y el inbox la leen directo con un
// <img src>, sin depender de Meta y sin que la foto caduque nunca.
//
// Best-effort: nunca lanza (se llama en segundo plano). Idempotente por wamid.
import { getSupabase, CUENTA } from './supabase.js'
import { extensionDeArchivo } from './descarga.js'

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v19.0'
const BUCKET = 'inbox-media'

// Extensión de archivo según el MIME que devuelve Meta.
// Cubre TODOS los tipos a propósito. Antes solo había imágenes, y por eso los
// audios y videos de los clientes se quedaron colgando del media_id de Meta: el
// 27-jul se rompió el número, la API de media empezó a devolver 500 y 64 archivos
// (47 notas de voz, 9 videos) se perdieron sin posibilidad de recuperarlos.
// Si Meta manda un MIME que no está acá, se guarda igual como .bin — perder la
// extensión es infinitamente mejor que perder el archivo.
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

// wamid → nombre de archivo seguro (los wamid traen '=', '/', etc.).
const safeName = (wamid) => String(wamid || '').replace(/[^a-zA-Z0-9._-]/g, '_')

/**
 * Archiva el adjunto de un mensaje entrante (foto, audio, video, sticker o
 * documento) y devuelve la URL pública (o null).
 * - Idempotente: si el mensaje ya tiene media_url, no re-baja ni re-sube.
 * - Best-effort: cualquier fallo se loguea y devuelve null (no rompe el webhook).
 * @param {{ mediaId:string, wamid:string, cuenta?:string }} args
 */
export async function archivarMedia(args) {
  return (await archivarMediaDetalle(args)).url
}

// Por qué no se pudo archivar, en palabras que se entienden. El rescate antes
// llamaba "no estaban en Meta" a CUALQUIER fallo: el 16-oct-2026 tres .psd que
// Meta sí tenía se dieron por perdidos y era el tope de 25 MB del bucket.
export function motivoDeSubida(mensaje) {
  const m = String(mensaje || '')
  if (/maximum allowed size|too large|payload too large/i.test(m)) return 'muy_grande_para_el_bucket'
  if (/mime type .* not supported/i.test(m)) return 'tipo_rechazado_por_el_bucket'
  return `bucket: ${m.slice(0, 120)}`
}
export function motivoDeLookup(status) {
  // 400/404 al pedir el media_id = Meta ya lo borró (el control `?control=1`
  // del rescate confirma que el token está bien).
  return status === 400 || status === 404 ? 'meta_ya_lo_borro' : `meta_respondio_${status}`
}

/** Igual que `archivarMedia`, pero dice el motivo cuando falla: { url, motivo }. */
export async function archivarMediaDetalle({ mediaId, wamid, cuenta = CUENTA }) {
  try {
    if (!mediaId || !wamid) return { url: null, motivo: 'sin_media_id' }
    if (!META_TOKEN) { console.warn('[media-archive] sin META_TOKEN'); return { url: null, motivo: 'sin_token' } }
    const sb = getSupabase()

    // Idempotencia: si el mensaje ya tiene media_url archivada, salir.
    const { data: existente } = await sb
      .from('mensajes').select('media_url, tipo, texto').eq('wa_message_id', wamid).maybeSingle()
    if (existente && existente.media_url) return { url: existente.media_url, motivo: null }

    // 1) Resolver una URL fresca del media_id (la de Meta caduca; el id no).
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${META_TOKEN}` },
    })
    if (!metaRes.ok) { console.warn('[media-archive] lookup', metaRes.status); return { url: null, motivo: motivoDeLookup(metaRes.status) } }
    const meta = await metaRes.json()
    if (!meta?.url) return { url: null, motivo: 'meta_sin_url' }

    // 2) Bajar el binario (Meta exige el token en el header).
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${META_TOKEN}` } })
    if (!bin.ok) { console.warn('[media-archive] download', bin.status); return { url: null, motivo: `descarga_${bin.status}` } }
    const contentType = (bin.headers.get('content-type') || meta.mime_type || 'image/jpeg').split(';')[0].trim()
    // Un documento lleva la extensión de SU NOMBRE ('Conejo.ai'), no la del MIME:
    // Meta manda .ai/.eps como `application/postscript` y .psd/.ttf con MIMEs que
    // no están en la tabla, y quedaban como `.bin` (ver lib/descarga.js).
    const extNombre = existente?.tipo === 'documento' ? extensionDeArchivo(existente?.texto) : ''
    const ext = extNombre || EXT[contentType] || 'bin'
    const buf = Buffer.from(await bin.arrayBuffer())

    // 3) Subir al bucket público (upsert = idempotente por path).
    const path = `${cuenta}/${safeName(wamid)}.${ext}`
    let { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true })
    // El bucket tiene lista de MIMEs permitidos: un .psd (`image/vnd.adobe.photoshop`)
    // o una fuente (`application/font-sfnt`) se rechazaban y el archivo quedaba
    // colgando del media_id, que Meta borra a los ~30 días. Default seguro: guardarlo
    // igual como binario genérico; el nombre lo pone la descarga, no el MIME.
    if (upErr && contentType !== 'application/octet-stream') {
      console.warn('[media-archive] upload', contentType, upErr.message, '→ reintento como octet-stream')
      ;({ error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'application/octet-stream', upsert: true }))
    }
    if (upErr) { console.warn('[media-archive] upload', upErr.message); return { url: null, motivo: motivoDeSubida(upErr.message) } }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = pub?.publicUrl || null
    if (!publicUrl) return { url: null, motivo: 'sin_url_publica' }

    // 4) Escribir la URL estable en la fila del mensaje.
    const { error: updErr } = await sb
      .from('mensajes').update({ media_url: publicUrl }).eq('wa_message_id', wamid)
    if (updErr) console.warn('[media-archive] update media_url', updErr.message)

    return { url: publicUrl, motivo: null }
  } catch (e) {
    console.warn('[media-archive] falló:', e?.message || e)
    return { url: null, motivo: `error: ${String(e?.message || e).slice(0, 120)}` }
  }
}
