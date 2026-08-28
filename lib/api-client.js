// lib/api-client.js — IND Store Inbox
// (Sin secretos: el token de Meta vive server-side en /api/upload-media y /api/media.)

import { CANALES, CANAL_POR_DEFECTO, phoneIdDeCanal } from './canales.js'
import { canalDeEnvio } from './bandeja.js'

// ── Canal activo (qué número se está atendiendo) ─────────────────────────────
// Vive a nivel de módulo a propósito: hay una decena de puntos de envío y de
// lectura, y pasar el canal por parámetro en todos era invitar a que alguno se
// olvidara y mandara por el número equivocado. La App lo fija al cambiar de
// bandeja y todo lo de abajo lo usa solo.
let CANAL_ACTIVO = phoneIdDeCanal(CANAL_POR_DEFECTO)

// La última versión que vio ESTA pestaña, por canal (ver fetchInboxSync).
const ETAGS = {}

export function setCanalActivo(idLogico) {
  CANAL_ACTIVO = phoneIdDeCanal(idLogico)
  // ☠️ Se olvida el etag de ese canal. Cambiar de número VACÍA la pantalla
  // (`setConvs([]); setContacts({})` en App.jsx) y recarga; si el servidor
  // contestara 304 porque nada cambió desde la última vez que vimos ese canal,
  // no habría nada que conservar y el inbox quedaría EN BLANCO.
  delete ETAGS[CANAL_ACTIVO]
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
//
// ⚠️ Manda `If-None-Match` con la última versión conocida. Si nada cambió, el
// servidor contesta **304 sin cuerpo** y acá se devuelve `{ sinCambios: true }`.
// `App.load()` hace `sync?.lista ?? null`, así que eso conserva todo lo que ya
// está en pantalla sin una sola línea extra allá.
//
// Medido el 28-ago: 3 de cada 4 ciclos de IND y 9 de cada 10 de MANDI no traen
// nada nuevo. Eso es el 63% de la factura de Vercel en bytes repetidos.
//
// `null` (error) también conserva lo previo, pero significa otra cosa: 304 es
// "pregunté y no hay novedad", null es "no pude preguntar".
export async function fetchInboxSync({ sinCache = false } = {}) {
  const canal = CANAL_ACTIVO
  try {
    const cabeceras = {}
    // `sinCache` = "acabo de cambiar algo, dame la verdad completa". Ahí no se
    // manda el etag: aunque el servidor casi siempre lo vería distinto (un cambio
    // de estado toca `bandeja.actualizado_en`), no vale la pena depender de eso
    // justo en el momento en que el vendedor está mirando si su clic surtió.
    if (!sinCache && ETAGS[canal]) cabeceras['If-None-Match'] = ETAGS[canal]
    const res = await fetch(`/api/inbox-sync?canal=${canal}`, {
      cache: 'no-store',   // el navegador no puede meterse: el condicional lo manejamos acá
      headers: cabeceras,
    })
    if (res.status === 304) return { sinCambios: true }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const etag = res.headers.get('etag')
    if (etag) ETAGS[canal] = etag
    return await res.json()   // { lista, rows, contactos, pendientes }
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

async function patchContacto(telefono, campo, valor, canal = '') {
  try {
    const res = await fetch('/api/contactos/estado', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      // `canal` solo lo manda el estado: es el unico campo que vive POR NUMERO.
      // El alias, las notas o la temperatura son de la PERSONA y siguen igual.
      body: JSON.stringify({ telefono, campo, valor, ...(canal ? { canal } : {}) }),
    })
    return { ok: res.ok }
  } catch { return { ok: false } }
}

// `canal` opcional: el numero de ESTA conversacion. Sin el, el estado solo se
// escribe en el lado viejo (una fila por persona) y la bandeja de ese numero se
// queda atras. Se cae a la pestana, que es lo correcto en el CHAT: su lista ya
// viene filtrada por numero.
export async function updateContact(telefono, nombre, estado, alias, forzarEstado = false, modo = null, canal = '') {
  await patchContacto(telefono, 'estado', estado, canalDeEnvio({ conversacion: canal, pestana: CANAL_ACTIVO }))
  if (modo !== null) await patchContacto(telefono, 'modoIA', modo)
  if (alias) await patchContacto(telefono, 'alias', alias)
}
export async function toggleIAMode(telefono, nombre, estado, alias, modoIA) {
  return patchContacto(telefono, 'modoIA', modoIA ? 'IA' : 'HUMANO')
}
// ── NOTAS ─────────────────────────────────────────────────────────
// Varias notas por chat, cada una con su fecha (antes era una sola que se
// pisaba entera). Viven en su propia tabla, no en la columna del contacto.

export async function fetchNotas(telefono) {
  const r = await fetch(`/api/notas?telefono=${encodeURIComponent(telefono)}`, { cache: 'no-store' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'No se pudieron leer las notas')
  return d.notas || []
}

export async function addNota(telefono, texto) {
  const r = await fetch('/api/notas', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefono, texto }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar la nota')
  return d.nota
}

export async function editNota(id, texto) {
  const r = await fetch('/api/notas', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, texto }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'No se pudo editar la nota')
  return d.nota
}

export async function deleteNota(id) {
  const r = await fetch(`/api/notas?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'No se pudo borrar la nota')
  return d
}
export async function setIdVenta(telefono, idVenta) {
  return patchContacto(telefono, 'idVenta', idVenta)
}

// ── LINK PAGO (panel Ventas) ─────────────────────────────────────
// Portado desde wa-inbox-next (MANDI) el 15-ago-2026: IND reutiliza la cuenta
// dLocal de MANDI (decisión explícita del dueño, ver lib/dlocal.js), con su
// propio mensaje y su propio `description` para dLocal. Genera el link y el
// texto listo para copiar. NO manda nada al chat: eso lo decide el vendedor
// con el botón Copiar.
export async function generarLinkPago(telefono, monto) {
  const r = await fetch('/api/linkpago', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefono, monto }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo generar el link de pago')
  return d // { ok, link, texto }
}

// Eje 2: temperatura del lead (manual). '' / null limpia la clasificación.
export async function updateTemperatura(telefono, temperatura) {
  return patchContacto(telefono, 'temperatura', temperatura || '')
}

/**
 * El cuerpo que se manda a guardar una respuesta rápida.
 *
 * ☠️ ESTÁ APARTE Y PROBADO PORQUE ACÁ SE PERDIÓ UN AUDIO EN MANDI (21-ago). Este
 * objeto enumera los campos A MANO, y al agregar los adjuntos ordenados nadie sumó
 * `adjuntos` a la lista: el editor lo guardaba bien, la base lo aceptaba bien, y el
 * campo moría en este intermediario. Se armó la respuesta con audio, se guardó sin
 * ningún error, y el audio no llegó a existir.
 *
 * Cualquier campo NUEVO de una respuesta rápida tiene que sumarse acá o pasa lo
 * mismo, en silencio.
 */
export function cuerpoDeRespuesta(accion, reply = {}) {
  return {
    accion, id: reply.id, texto: reply.text,
    imagenUrl: reply.imageUrl || '', imagenUrl2: reply.imageUrl2 || '',
    imagenUrl3: reply.imageUrl3 || '', imagenUrl4: reply.imageUrl4 || '',
    imagenUrl5: reply.imageUrl5 || '', imagenUrl6: reply.imageUrl6 || '',
    imagenUrl7: reply.imageUrl7 || '', imagenUrl8: reply.imageUrl8 || '',
    imagenUrl9: reply.imageUrl9 || '', imagenUrl10: reply.imageUrl10 || '',
    // La lista ORDENADA (fotos y audios). Lleva las notas de voz y el orden en que
    // el cliente los ve.
    adjuntos: Array.isArray(reply.adjuntos) ? reply.adjuntos : [],
    botones: Array.isArray(reply.botones) ? reply.botones : [],
  }
}

export async function writeReply(accion, reply) {
  try {
    const res = await fetch('/api/respuestas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoDeRespuesta(accion, reply)),
    })
    return { ok: res.ok }
  } catch (err) {
    // Antes este catch era mudo (`catch { return {ok:false} }`): un fallo de red
    // al guardar se veía igual que uno de validación, y no quedaba ni rastro.
    console.error('[api-client] writeReply:', err)
    return { ok: false }
  }
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
      // ☠️ EL CANAL LO DECIDE LA CONVERSACIÓN, NO LA PESTAÑA. Antes esta línea
      // pisaba todo con `CANAL_ACTIVO` —el número de la bandeja en la que quedó
      // parado el vendedor— y por ahí murieron 79 mensajes en agosto: CONTACTOS
      // es la AGENDA, no tiene canal propio, y mandaba por donde estuvieras.
      // Quien sepa a qué número escribió el cliente pasa `Canal` en el body; el
      // resto sigue cayendo a la pestaña, exactamente como antes.
      body: JSON.stringify({ ...body, Canal: canalDeEnvio({ conversacion: body.Canal, pestana: CANAL_ACTIVO }) }),
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
// `canal` opcional: el número al que ESE cliente escribió. Lo usa CONTACTOS, que
// no tiene pestaña que valga. Sin él se cae a la pestaña, como siempre.
export const sendReply = (t, n, m, contextoId = '', canal = '') =>
  postSaliente({ Telefono: t, Nombre: n, Mensaje: m, ...(contextoId ? { ContextoId: contextoId } : {}), ...(canal ? { Canal: canal } : {}) })
// `mediaId` opcional: si ya lo tenemos pre-resuelto (ver precacheMedia), el envío
// se salta la descarga + subida a Meta y sale en milisegundos.
// `contextoId` opcional: la cita va SOLO en la primera pieza de un envio (ver
// lib/cita.js). Meta acepta `context.message_id` en cualquier tipo de mensaje.
export const sendImageUrl = (t, n, u, mediaId = '', contextoId = '') =>
  postSaliente({ Telefono: t, Nombre: n, ImagenURL: u, ...(mediaId ? { ImagenMediaId: mediaId } : {}), ...(contextoId ? { ContextoId: contextoId } : {}) })

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
export async function sendInteractiveButtons(t, n, body, buttons, contextoId = '') {
  return postSaliente({ Telefono: t, Nombre: n, TipoMensaje: 'interactive_buttons',
    Cuerpo: body, Botones: JSON.stringify(buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))),
    ...(contextoId ? { ContextoId: contextoId } : {}) })
}
// WhatsApp Cloud API: límite duro de 16 MB para video.
const MAX_VIDEO_BYTES = 16 * 1024 * 1024
// El tope del documento NO lo pone WhatsApp (permite 100 MB) sino el bucket
// inbox-media, que corta en 25 MB. Mismo numero que /api/upload-url.
const MAX_DOC_BYTES = 25 * 1024 * 1024

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
/**
 * Convierte un audio a nota de voz (si hace falta), lo sube y devuelve su url.
 *
 * Aparte del envío porque los dos caminos lo necesitan: mandarlo al toque en un
 * chat, y GUARDARLO en una respuesta rápida. En el segundo la conversión ocurre
 * UNA sola vez —al guardar la respuesta— y de ahí en adelante usarla solo manda
 * el link, sin cargar el codificador ni hacer esperar a nadie.
 */
export async function subirAudioNota(audioFile, { onProgreso } = {}) {
  if (audioFile.size > MAX_VIDEO_BYTES) {
    throw new Error('El audio supera el límite de 16 MB de WhatsApp')
  }
  const { necesitaConversion, convertirANotaDeVoz } = await import('./audio-nota-voz.js')

  let archivo = audioFile
  let contentType = audioFile.type || 'audio/ogg'
  if (necesitaConversion(audioFile)) {
    try {
      archivo = await convertirANotaDeVoz(audioFile, { onProgreso })
      contentType = 'audio/ogg'
    } catch (e) {
      throw new Error(`No se pudo convertir el audio a nota de voz: ${e.message}`)
    }
  }

  // Mismo camino que el video: URL firmada, subida DIRECTA a Supabase (sin el
  // muro de 4,5 MB de Vercel) y Meta baja el archivo del link.
  const signed = await (await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, size: archivo.size }),
  })).json()
  if (!signed.uploadUrl) throw new Error(signed.error || 'No se pudo preparar la subida')

  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', archivo, 'nota.ogg')
  const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: form })
  if (!put.ok) {
    const detalle = await put.text().catch(() => '')
    throw new Error(`No se pudo subir el audio (HTTP ${put.status}) ${detalle.slice(0, 140)}`.trim())
  }
  return signed.publicUrl
}

/**
 * Manda un audio como NOTA DE VOZ (la burbuja del micrófono con las ondas).
 *
 * Convierte antes de subir: Meta solo pinta la nota de voz si el archivo es
 * OGG/Opus, y las voces generadas salen en MP3. Sin la conversión llegaría como
 * archivo adjunto: suena igual pero se ve como un envío masivo en vez de una
 * persona hablándote.
 *
 * Si la conversión falla NO manda el original a escondidas: devuelve el error y
 * quien llama decide.
 *
 * El canal va por `postSaliente`, que inyecta `CANAL_ACTIVO` en todos los envíos.
 */
export async function sendAudio(telefono, nombre, audioFile, { onProgreso } = {}) {
  try {
    const url = await subirAudioNota(audioFile, { onProgreso })
    return postSaliente({ Telefono: telefono, Nombre: nombre, AudioURL: url })
  } catch (err) {
    console.error('[api-client] sendAudio:', err)
    return { ok: false, error: err.message || 'No se pudo enviar el audio' }
  }
}

/**
 * Manda un audio que YA está subido y en OGG/Opus, por su link.
 *
 * Lo usan las respuestas rápidas: ahí el audio se convirtió UNA sola vez, al
 * guardar la respuesta. Sale tan rápido como una foto cacheada.
 */
export async function enviarAudioUrl(telefono, nombre, audioUrl, contextoId = '') {
  return postSaliente({ Telefono: telefono, Nombre: nombre, AudioURL: audioUrl, ...(contextoId ? { ContextoId: contextoId } : {}) })
}

/**
 * Mandar un documento YA SUBIDO, por link. Es a `sendDocumento` lo que
 * `enviarAudioUrl` es a `sendAudio`: lo usan las respuestas rapidas, donde el
 * archivo se subio una sola vez al guardar la respuesta.
 *
 * ⚠️ `nombreArchivo` viene guardado en el adjunto. Si faltara —una respuesta
 * guardada antes de que existiera el campo— se manda "documento" en vez del
 * uuid del bucket, que es lo que veria el cliente.
 */
/**
 * Subir un documento al bucket y devolver su url publica, SIN enviarlo.
 * Lo usa el editor de respuestas rapidas: el archivo se sube una sola vez, al
 * guardar, y despues cada envio solo manda el link.
 */
export async function subirDocumento(file) {
  const nombreArchivo = String(file?.name || '').trim() || 'documento'
  const contentType = file?.type || 'application/octet-stream'

  const signed = await (await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, size: file?.size || 0, filename: nombreArchivo }),
  })).json()
  if (!signed.uploadUrl) throw new Error(signed.error || 'No se pudo preparar la subida')

  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', file, nombreArchivo)
  const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: form })
  // ⚠️ res.ok: sin esto un rechazo del bucket devolveria una url que no existe y
  // la respuesta rapida quedaria guardada apuntando a la nada.
  if (!put.ok) {
    const detalle = await put.text().catch(() => '')
    throw new Error(`No se pudo subir el documento (HTTP ${put.status}) ${detalle.slice(0, 140)}`.trim())
  }
  return { url: signed.publicUrl, nombre: nombreArchivo }
}

export async function enviarDocumentoUrl(telefono, nombre, docUrl, nombreArchivo = '', contextoId = '') {
  return postSaliente({
    Telefono: telefono, Nombre: nombre,
    DocURL: docUrl,
    DocNombre: String(nombreArchivo || '').trim() || 'documento',
    ...(contextoId ? { ContextoId: contextoId } : {}),
  })
}

/**
 * Mandar un DOCUMENTO (pdf, docx, xlsx, dwg, zip... lo que sea).
 *
 * Mismo camino que sendVideo: se pide una URL firmada, el archivo sube DIRECTO a
 * Supabase (no pasa por Vercel, que corta el body en ~4,5 MB) y Meta lo descarga
 * del link publico.
 *
 * Diferencias con el video:
 *  - Se manda `DocNombre`: es el nombre que ve el cliente. Sin el, WhatsApp
 *    muestra el uuid del archivo.
 *  - Se manda `DocCaption`: el documento SI acepta texto pegado (el audio no),
 *    asi que el mensaje del vendedor viaja con el archivo en vez de aparte.
 */
export async function sendDocumento(telefono, nombre, docFile, caption = '') {
  try {
    if (docFile.size > MAX_DOC_BYTES) {
      const mb = Math.round(MAX_DOC_BYTES / (1024 * 1024))
      return { ok: false, error: `El documento pesa ${(docFile.size / (1024 * 1024)).toFixed(1)} MB y el límite es ${mb} MB` }
    }
    const nombreArchivo = String(docFile.name || '').trim() || 'documento'
    // Si el navegador no supo el tipo, se manda uno generico: el bucket lo acepta
    // y WhatsApp no lo necesita para un documento.
    const contentType = docFile.type || 'application/octet-stream'

    const signed = await (await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `filename` es lo que /api/upload-url usa para la extension del archivo
      // guardado; el nombre que ve el cliente viaja aparte, en DocNombre.
      body: JSON.stringify({ contentType, size: docFile.size, filename: nombreArchivo }),
    })).json()
    if (!signed.uploadUrl) throw new Error(signed.error || 'No se pudo preparar la subida')

    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', docFile, nombreArchivo)
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'true' },
      body: form,
    })
    // ⚠️ Mirar res.ok: fetch NO lanza con 4xx/5xx. Sin esto, un rechazo del bucket
    // seguiria de largo y se mandaria a Meta un link que no existe.
    if (!put.ok) {
      const detalle = await put.text().catch(() => '')
      throw new Error(`No se pudo subir el documento (HTTP ${put.status}) ${detalle.slice(0, 140)}`.trim())
    }

    return postSaliente({
      Telefono: telefono,
      Nombre: nombre,
      DocURL: signed.publicUrl,
      DocNombre: nombreArchivo,
      DocCaption: String(caption || '').trim(),
    })
  } catch (err) {
    console.error('[api-client] sendDocumento:', err)
    return { ok: false, error: err.message }
  }
}

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
export async function sendTemplate(telefono, nombre, tpl, canal = '') {
  try {
    const res = await fetch('/api/saliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Canal: canalDeEnvio({ conversacion: canal, pestana: CANAL_ACTIVO }),
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
