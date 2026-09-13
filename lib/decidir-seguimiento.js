// lib/decidir-seguimiento.js — ¿Le toca un mensaje automático a este chat, y cuál?
//
// Módulo PURO (sin red ni base) para que la regla entera se pueda probar. El cron
// (/api/cron/seguimientos) solo recorre la agenda, llama acá y manda lo que salga.
//
// Dos familias de reglas, y como mucho UN automático por ventana de 24 h:
//
//   1. TEMPERATURA (🔥 🌤️ ❄️): la pone un humano en el chat. Dispara a las
//      `horas` de silencio del CLIENTE (desde su último mensaje).
//   2. ENCUESTA DE REACTIVACIÓN: el chat está en ATENDIDO (o sea, contesté yo y
//      el cliente se quedó callado). Dispara a las `horas` de MI último mensaje.
//      Al salir, el cron mueve el chat a la bandeja ENCUESTA; lo que el cliente
//      toque entra como texto y lo devuelve a PENDIENTES.
//
// La temperatura manda sobre la encuesta cuando las dos aplican: es la señal
// más específica, la puso una persona.
//
// Todo SIEMPRE dentro de la ventana de 24 h de Meta (desde el último mensaje del
// cliente): pasadas las 24 h ya no se manda gratis y toca plantilla.
import { caminoDeSeguimiento } from './camino-seguimiento.js'

export const VENTANA_H = 24
const H = 3600 * 1000
const TEMPS = ['caliente', 'tibio', 'frio']

const ms = (iso) => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}
const reglaViva = (r) => Boolean(r?.activo && String(r.texto || '').trim())

/**
 * @returns {{ motivo:'caliente'|'tibio'|'frio'|'encuesta', regla:object } | null}
 */
export function decidirSeguimiento({ config, contacto, ahoraMs = Date.now() }) {
  const seg = config?.seguimientos
  if (!seg?.activo) return null

  const estado = String(contacto?.estado || '').toLowerCase()
  if (estado === 'archivado') return null
  if (String(contacto?.idVenta || '').trim()) return null   // ya es venta → sin seguimiento comercial
  if (caminoDeSeguimiento({ config, contacto }) === 'saltar') return null

  const entMs = ms(contacto?.ultimoEntranteAt)
  if (!entMs) return null
  const silencioClienteH = (ahoraMs - entMs) / H
  if (silencioClienteH < 0 || silencioClienteH >= VENTANA_H) return null   // ventana cerrada

  // ¿Ya hubo un automático en ESTA ventana? (el último seguimiento es posterior al último entrante)
  if (ms(contacto?.ultimoSeguimientoAt) > entMs) return null

  // 1) Temperatura.
  const temp = String(contacto?.temperatura || '').toLowerCase()
  if (TEMPS.includes(temp)) {
    const regla = seg[temp]
    if (reglaViva(regla) && silencioClienteH >= (Number(regla.horas) || VENTANA_H)) {
      return { motivo: temp, regla }
    }
  }

  // 2) Encuesta de reactivación: solo chats ATENDIDOS donde el último mensaje es MÍO.
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
