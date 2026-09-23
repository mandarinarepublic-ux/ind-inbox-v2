// lib/decidir-seguimiento.js — ¿Le toca un mensaje automático a este chat, y cuál?
//
// Módulo PURO (sin red ni base) para que la regla entera se pueda probar. El cron
// (/api/cron/seguimientos) solo recorre la agenda, llama acá y manda lo que salga.
//
// Una sola familia de reglas, y como mucho UN automático por ventana de 24 h:
//
//   ☠️ Hasta el 22-sep-2026 había también reglas por TEMPERATURA (🔥 🌤️ ❄️). Se
//      quitaron: la temperatura dejó de ser manual (ahora es el tiempo desde el
//      último mensaje del cliente, lib/temperatura.js) y los flujos marcaban 🌤️ a
//      TODA la pauta, así que "¿Pudiste pensarlo?" le iba a llegar a todos. Lo que
//      reemplaza al seguimiento es la reactivación (lib/reactivacion.js).
//
//   ENCUESTA DE REACTIVACIÓN: el chat está en ATENDIDO (o sea, contesté yo y
//      el cliente se quedó callado). Dispara a las `horas` de MI último mensaje.
//      Lo que el cliente toque entra como texto y lo devuelve a PENDIENTES. (Ya no
//      existe la bandeja ENCUESTA: el chat se queda en ATENDIDO.)
//
// Candados de todo automático (diseño 2026-09-22): 🤫 sin automáticos, contacto
// interno, o 📌 le debemos algo → no se le escribe al cliente.
//
// Todo SIEMPRE dentro de la ventana de 24 h de Meta (desde el último mensaje del
// cliente): pasadas las 24 h ya no se manda gratis y toca plantilla.
import { caminoDeSeguimiento } from './camino-seguimiento.js'

export const VENTANA_H = 24
const H = 3600 * 1000

const ms = (iso) => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}
const reglaViva = (r) => Boolean(r?.activo && String(r.texto || '').trim())

/**
 * @returns {{ motivo:'encuesta', regla:object } | null}
 */
export function decidirSeguimiento({ config, contacto, ahoraMs = Date.now() }) {
  const seg = config?.seguimientos
  if (!seg?.activo) return null

  const estado = String(contacto?.estado || '').toLowerCase()
  if (estado === 'archivado') return null
  if (String(contacto?.idVenta || '').trim()) return null   // ya es venta → sin seguimiento comercial
  if (contacto?.sinAutomaticos || contacto?.tipoContacto === 'interno' || contacto?.deudaAt) return null
  if (caminoDeSeguimiento({ config, contacto }) === 'saltar') return null

  const entMs = ms(contacto?.ultimoEntranteAt)
  if (!entMs) return null
  const silencioClienteH = (ahoraMs - entMs) / H
  if (silencioClienteH < 0 || silencioClienteH >= VENTANA_H) return null   // ventana cerrada

  // ¿Ya hubo un automático en ESTA ventana? (el último seguimiento es posterior al último entrante)
  if (ms(contacto?.ultimoSeguimientoAt) > entMs) return null

  // Encuesta de reactivación: solo chats ATENDIDOS donde el último mensaje es MÍO.
  const enc = seg.encuesta
  if (reglaViva(enc) && estado === 'atendido') {
    const ultMs = ms(contacto?.ultimoMensajeAt)
    const escribiYoUltimo = ultMs > entMs
    if (escribiYoUltimo && (ahoraMs - ultMs) / H >= (Number(enc.horas) || VENTANA_H)) {
      return { motivo: 'encuesta', regla: enc }
    }
  }

  return null
}
