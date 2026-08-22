/**
 * Pausar el polling cuando la pantalla está encendida pero abandonada.
 *
 * ⚠️ POR QUÉ EXISTE, con números. Auditoría del 14-ago-2026, madrugada de
 * 01:00 a 05:00 hora Ecuador:
 *
 *   IND, 14-ago → 1.177 llamadas a /api/inbox-sync ... y entraron 2 mensajes
 *   IND, 13-ago →   995 llamadas                    ... y entraron 28
 *   MANDI       →     0 llamadas                    ... y entraron 3
 *
 * Cada llamada de IND mueve 4,36 MB. Medido después (30 días): de 00:00 a 05:00
 * entra el 1,5% del día — 9 mensajes contra 369 de la jornada. O sea que se
 * paga el tráfico de toda la noche para enterarse de casi nada.
 *
 * El código ya pausaba con `document.hidden`. Lo que NO cubría es la pestaña
 * VISIBLE pero abandonada: esa polleaba para siempre.
 *
 * Todo acá es puro —sin React, sin DOM— para poder probarlo con `node --test`.
 * Mismo patrón que `debeSonar` en lib/push.js.
 */

/**
 * Media hora sin un gesto deliberado.
 *
 * No bajarla sin volver a medir: quien atiende puede pasar un rato leyendo un
 * chat largo o hablando por teléfono sin tocar nada, y despertar la pantalla
 * cada dos por tres anula el ahorro sin ganar nada.
 */
export const VENTANA_INACTIVIDAD_MS = 30 * 60 * 1000

/**
 * Qué cuenta como "hay alguien ahí".
 *
 * ⚠️ `mousemove` NO está, a propósito. Se dispara con cualquier vibración del
 * escritorio o un ratón mal apoyado, así que la pestaña abandonada nunca
 * llegaría a pausarse y todo esto no serviría de nada. Solo gestos con
 * intención: tocar, teclear, rodar la rueda.
 */
export const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart']

/**
 * ¿Toca pausar el polling pesado?
 *
 * ⚠️ Ante dato faltante o corrupto devuelve `false` — NO pausar. Mismo criterio
 * que el resto del inbox: mejor una llamada de más que un vendedor mirando una
 * pantalla congelada sin saber que lo está.
 */
export function debePausar(ultimaActividadMs, ahoraMs, ventanaMs = VENTANA_INACTIVIDAD_MS) {
  if (typeof ultimaActividadMs !== 'number' || !Number.isFinite(ultimaActividadMs)) return false
  if (typeof ahoraMs !== 'number' || !Number.isFinite(ahoraMs)) return false
  return ahoraMs - ultimaActividadMs >= ventanaMs
}

/**
 * Durante la pausa se sigue pidiendo SOLO el contador de pendientes. ¿Subió?
 *
 * ⚠️ Esta función es la que evita que la pausa deje al equipo sin aviso. IND
 * tiene UNA sola suscripción de push, así que esa pantalla es la notificación
 * del equipo; y desde el 21-ago la pauta entra por el 3326, que no vive en
 * ningún celular. Cortar el latido del todo habría cambiado unos dólares de
 * tráfico por un lead pagado esperando en silencio.
 *
 * El contador pesa unos bytes contra los 4,36 MB del ciclo completo, así que el
 * ahorro se conserva casi entero.
 *
 * Solo importa que SUBA. Que baje es alguien contestando desde otro lado (el
 * celular, otra pantalla): no es una novedad que reclame atención acá.
 *
 * Ante basura devuelve `false`: un aviso falso cada 20 segundos entrena a
 * ignorarlos, justo lo que no puede pasar con el aviso de un cliente nuevo.
 */
export function hayNovedad(antes, ahora) {
  if (!ahora || typeof ahora !== 'object') return false
  const base = (antes && typeof antes === 'object') ? antes : {}

  for (const clave of Object.keys(ahora)) {
    const nuevo = Number(ahora[clave])
    const viejo = Number(base[clave] ?? 0)
    if (!Number.isFinite(nuevo) || !Number.isFinite(viejo)) continue
    if (nuevo > viejo) return true
  }
  return false
}
