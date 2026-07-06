// lib/api-client.js — IND Store Inbox
const META_PHONE_ID = '1092674123940116'
const META_TOKEN    = 'EAAV1SMGzaLkBR01kWvaBlW0EyWAHIAah0fBPU85s1ZClKFoAoyqZCmO4vG6tOXUdGWRkxZAGISpU7fK3kyyfijf5YH00OLae57dJsFVNTDhIUv3IuzbVOEZBdd8zDvEGYPACtF0dIB7gs4DmPvPhF4pQ2JZBuLk20NZAyPsKxRw4xaTwZBMCnisf7nsJyFsDPfZC4AZDZD'

export async function fetchRows() {
  try { return await (await fetch('/api/mensajes')).json() }
  catch { return [] }
}
export async function fetchContacts() {
  try { return await (await fetch('/api/contactos')).json() }
  catch { return [] }
}
export async function fetchRepliesFromSheet() {
  try { return await (await fetch('/api/respuestas')).json() }
  catch { return [] }
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
export async function sendInteractiveButtons(t, n, body, buttons) {
  return postSaliente({ Telefono: t, Nombre: n, TipoMensaje: 'interactive_buttons',
    Cuerpo: body, Botones: JSON.stringify(buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))) })
}
export async function sendVideo(telefono, nombre, videoFile) {
  try {
    const fd = new FormData()
    fd.append('file', videoFile, videoFile.name || 'video.mp4')
    fd.append('messaging_product', 'whatsapp')
    const up = await (await fetch(`https://graph.facebook.com/v19.0/${META_PHONE_ID}/media`,
      { method: 'POST', headers: { Authorization: `Bearer ${META_TOKEN}` }, body: fd })).json()
    if (!up.id) throw new Error(up.error?.message || 'Upload fallido')
    return postSaliente({ Telefono: telefono, Nombre: nombre, VideoMediaId: up.id })
  } catch (err) { return { ok: false, error: err.message } }
}
export const isDemo = () => false
