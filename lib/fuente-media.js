// lib/fuente-media.js — a qué hosts puede ir /api/media y a cuáles viaja el token.
//
// ☠️ Auditoría 25-sep-2026 (MANDI, mismo código acá): `/api/media?url=` descargaba
// CUALQUIER url mandando `Authorization: Bearer META_TOKEN`. Cualquiera con sesión
// podía apuntarlo a su propio servidor y quedarse con el token de Meta.

// API de Meta y el CDN de medios de WhatsApp: exigen el token.
const RE_CON_TOKEN = /(^|\.)(lookaside\.fbsbx\.com|graph\.facebook\.com|whatsapp\.net)$/i
// CDN público de Meta (fotos de anuncios): se puede pedir, pero SIN token.
const RE_CDN_META = /(^|\.)(fbcdn\.net|fbsbx\.com)$/i

function hostDe(url) {
  try { return new URL(url).hostname } catch { return '' }
}

/** Hosts a los que el proxy puede ir. Fuera de esta lista no se descarga nada. */
export function hostPermitidoParaProxy(url) {
  const h = hostDe(url)
  return RE_CON_TOKEN.test(h) || RE_CDN_META.test(h)
}

/** El token solo viaja a la API de Meta / WhatsApp, nunca a un CDN ni a otro dominio. */
export function llevaToken(url) {
  return RE_CON_TOKEN.test(hostDe(url))
}
