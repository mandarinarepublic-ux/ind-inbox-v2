// lib/api-client.js — IND Store Inbox
// (Sin secretos: el token de Meta vive server-side en /api/upload-media y /api/media.)

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
export async function fetchContacts() {
  try { return await getJSON('/api/contactos') }
  catch { return null }
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

async function postSaliente(body) {
  try {
    return { ok: (await fetch('/api/saliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).ok }
  } catch { return { ok: false } }
}

export const sendReply = (t, n, m) => postSaliente({ Telefono: t, Nombre: n, Mensaje: m })
export const sendImageUrl = (t, n, u) => postSaliente({ Telefono: t, Nombre: n, ImagenURL: u })
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
export async function sendVideo(telefono, nombre, videoFile) {
  try {
    // El upload a Meta se hace server-side (el token no viaja al navegador).
    const fd = new FormData()
    fd.append('file', videoFile, videoFile.name || 'video.mp4')
    const up = await (await fetch('/api/upload-media', { method: 'POST', body: fd })).json()
    if (!up.id) throw new Error(up.error || 'Upload fallido')
    return postSaliente({ Telefono: telefono, Nombre: nombre, VideoMediaId: up.id })
  } catch (err) { return { ok: false, error: err.message } }
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
