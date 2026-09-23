// lib/url-propia.js — la dirección con la que un CRON se llama a sí mismo.
//
// ☠️ Los crons armaban la dirección con `new URL(req.url).origin`. Vercel Cron
// invoca la dirección INTERNA del despliegue (`ind-inbox-v2-xxxx-….vercel.app`),
// y esa tiene la protección de Vercel prendida: toda llamada a `/api/saliente`
// rebotaba con `401 Protected deployment` ANTES de llegar a nuestro código.
// El cron devolvía 200 igual, así que se veía sano. Medido el 22-sep-2026:
// CERO seguimientos en toda la historia (~40 rechazos por hora, todos 401).
//
// El dominio de producción no pasa por esa protección: contesta nuestro propio
// candado, que sí acepta la credencial de máquina (lib/auth-maquina.js).
//
// El webhook NO usa esto: lo llama Meta por el dominio público, así que su
// `host` ya es el bueno.
export const URL_PRODUCCION = 'https://ind-inbox.apps.mandarinaec.com'

/** Base sin barra final. `INBOX_URL` la sobreescribe sin tocar código. */
export function urlPropia(env = process.env) {
  const base = String(env?.INBOX_URL || '').replace(/[^\x21-\x7E]/g, '').trim() || URL_PRODUCCION
  return base.replace(/\/+$/, '')
}
