// lib/reactivacion.js — ¿Le toca un mensaje automático a un cliente que se quedó
// callado ANTES de comprar? (diseño 2026-09-22 §5, fase 3)
//
// Solo le escribe si se cumple TODO:
//   · el último mensaje es NUESTRO (si el cliente habló último, le toca a una persona: 🔴)
//   · no hay 📌 (si le debemos algo, se avisa al vendedor, no al cliente)
//   · no está en 🤫 y no es contacto interno ni archivado
//   · etapa 💬 Cotizando o 💳 Esperando pago, sin pedido en ninguna tienda
//   · ventana de 24 h abierta (desde el último mensaje del cliente)
//   · entre 08:00 y 22:00 hora de Ecuador (nunca de noche)
//   · el bot no está llevando ese chat
// Toques a las 3, 12 y 20 h del último mensaje del cliente, con ≥2 h entre toques.
// Si cae de noche, sale a la mañana siguiente si todavía hay ventana. El contador
// vuelve a 0 cuando escribe el cliente o una persona.
//
// Lo que midieron 30 conversaciones reales: ayuda en ventas con intención clara
// de pagar; hace DAÑO a la hora, a quien prometió pagar "mañana" (para eso 🤫), a
// un cliente molesto y cuando la deuda era nuestra (para eso 📌).
//
// Arranca APAGADA (config.reactivacion.activo = false): la prende Rodrigo.
// Módulo PURO.
import { etapaVigente } from './etiqueta-crm.js'
import { caminoDeSeguimiento } from './camino-seguimiento.js'

const H = 3600 * 1000
export const HORAS_TOQUES = [3, 12, 20]
export const MIN_ENTRE_TOQUES_H = 2
export const HORA_DESDE = 8
export const HORA_HASTA = 22

export const TEXTOS_DEFECTO = {
  cotizando: [
    '¡Hola {nombre}! 👋 ¿Pudiste ver la propuesta? Si quieres te paso el total y los datos para dejarlo listo 🖤',
    '¡Buen día {nombre}! ☀️ Sigo guardándote tu diseño. ¿Te ayudo a decidir algún detalle?',
    '{nombre}, te escribo antes de que se cierre nuestro chat 🙌 ¿Seguimos con tu pedido?',
  ],
  esperando_pago: [
    '¡Hola {nombre}! 👋 ¿Pudiste hacer la transferencia? Apenas me mandes el comprobante lo paso a producción 🖤',
    '¡Buen día {nombre}! ☀️ Tu pedido está listo para entrar a producción apenas confirmes el pago.',
    '{nombre}, te escribo antes de que se cierre nuestro chat 🙌 ¿Te ayudo con algo del pago?',
  ],
}

const ms = (iso) => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Hora (0–23) en Ecuador: UTC−5 todo el año, sin horario de verano. */
export function horaEcuador(ahoraMs) {
  return new Date(ahoraMs - 5 * H).getUTCHours()
}

/** Reemplaza {nombre} sin dejar "¡Hola !" cuando no hay nombre. */
export function ponerNombre(texto, nombreCompleto) {
  const nombre = String(nombreCompleto || '').trim().split(/\s+/)[0] || ''
  let t = String(texto || '')
  if (nombre) return t.replaceAll('{nombre}', nombre)
  t = t.replace(/\{nombre\},\s*/g, '').replace(/\s+\{nombre\}/g, '').replaceAll('{nombre}', '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * @param {{config:object, contacto:object, pedido?:object|null, ahoraMs?:number}} args
 *   contacto = { telefono, nombre, alias, phoneId, estado, idVenta, etapa, etapaAt,
 *                deudaAt, sinAutomaticos, tipoContacto, ultimoEntranteAt,
 *                ultimoMensajeAt, reactivacionN, reactivacionAt, modoIA }
 * @returns {{ toque:number, etapa:string, texto:string } | null}
 */
export function decidirReactivacion({ config, contacto: c, pedido = null, ahoraMs = Date.now() }) {
  const r = config?.reactivacion
  if (!r?.activo || !c) return null
  if (c.tipoContacto === 'interno' || c.sinAutomaticos || c.deudaAt) return null
  if (String(c.estado || '').toLowerCase() === 'archivado') return null
  if (String(c.idVenta || '').trim()) return null
  const etapa = etapaVigente(c.etapa, c.etapaAt, pedido)
  if (etapa !== 'cotizando' && etapa !== 'esperando_pago') return null
  if (caminoDeSeguimiento({ config, contacto: c }) === 'saltar') return null   // el bot lleva el chat

  const ent = ms(c.ultimoEntranteAt)
  if (!ent || !(ms(c.ultimoMensajeAt) > ent)) return null   // el último mensaje tiene que ser nuestro
  const h = (ahoraMs - ent) / H
  if (h < 0 || h >= 24) return null                           // ventana cerrada
  const hora = horaEcuador(ahoraMs)
  if (hora < HORA_DESDE || hora >= HORA_HASTA) return null    // nunca de noche

  const umbrales = Array.isArray(r.horas) && r.horas.length ? r.horas.map(Number) : HORAS_TOQUES
  const n = Number(c.reactivacionN) || 0
  if (n >= umbrales.length || h < umbrales[n]) return null
  const ultimoToque = ms(c.reactivacionAt)
  if (n > 0 && ultimoToque && (ahoraMs - ultimoToque) / H < MIN_ENTRE_TOQUES_H) return null

  const plantilla = r.textos?.[etapa]?.[n] || TEXTOS_DEFECTO[etapa][n] || ''
  const texto = ponerNombre(plantilla, c.alias || c.nombre).trim()
  if (!texto) return null
  return { toque: n + 1, etapa, texto }
}
