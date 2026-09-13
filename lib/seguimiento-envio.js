// lib/seguimiento-envio.js — Qué se le manda al cliente en un seguimiento.
//
// Módulo PURO (sin red ni base) para que se pueda probar: arma el cuerpo que
// recibe /api/saliente a partir de la regla de la temperatura y el contacto.
//
//  - Sin botones → texto plano ({ Telefono, Nombre, Mensaje, Canal }).
//  - Con botones → mensaje interactivo de WhatsApp (TipoMensaje
//    'interactive_buttons', Cuerpo, Botones), el mismo formato que ya usa la
//    pantalla de RESPUESTAS RÁPIDAS. Meta permite hasta 3 botones de 20 letras.
//
// `Canal` es OBLIGATORIO: el seguimiento sale por el número al que el cliente
// escribió. Sin él, /api/saliente cae al principal y el cliente del 9804
// recibiría el mensaje desde el 3326 — o directamente fuera de ventana.

export const MAX_BOTONES = 3
export const MAX_TITULO = 20

/**
 * Normaliza lo que venga de la configuración ([{title}] o ['título']) a
 * [{ id, title }]: sin vacíos, títulos recortados a 20, nunca más de 3.
 */
export function normalizarBotones(lista) {
  const out = []
  for (const b of Array.isArray(lista) ? lista : []) {
    const title = String((b && typeof b === 'object') ? b.title : b || '').trim().slice(0, MAX_TITULO)
    if (!title) continue
    out.push({ id: `seg_${out.length + 1}`, title })
    if (out.length >= MAX_BOTONES) break
  }
  return out
}

/** Cuerpo para POST /api/saliente. */
export function cuerpoSeguimiento({ regla, contacto }) {
  const base = {
    Telefono: contacto.telefono,
    Nombre: contacto.alias || contacto.nombre || '',
    Canal: contacto.phoneId,
  }
  const texto = String(regla?.texto || '').trim()
  const botones = normalizarBotones(regla?.botones)
  if (!botones.length) return { ...base, Mensaje: texto }
  return {
    ...base,
    TipoMensaje: 'interactive_buttons',
    Cuerpo: texto,
    Botones: JSON.stringify(botones.map(({ id, title }) => ({ type: 'reply', reply: { id, title } }))),
  }
}
