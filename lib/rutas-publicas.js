// Las ÚNICAS rutas del inbox de IND que nunca piden sesión, porque quien las
// llama no puede tener una. Salen del inventario MEDIDO del 8-ago-2026
// (docs/INVENTARIO-RUTAS-IND-2026-08-08.md), no de la memoria de nadie.
//
// Cada una se defiende sola:
//   /api/webhook           → firma de Meta con META_APP_SECRET (7.880 llamadas en 3 días)
//   /api/cron/seguimientos → CRON_SECRET (3 llamadas en 3 días)
//   /api/cron/pendientes   → CRON_SECRET (recordatorio de pendientes por Telegram,
//                            cada 5 min — puerto desde MANDI el 13-ago-2026)
//   /api/pago-dlocal       → secreto compartido en la URL (mismo mecanismo que en
//                            MANDI, verificado ahí: 401 sin él)
//
// ⚠️ DECISIÓN DEL DUEÑO, 15-ago-2026: hasta acá esta lista decía "IND no tiene
// SOCIAL ni dLocal, no copies la lista de MANDI" — y era cierto. El dueño pidió
// explícitamente sumar dLocal reutilizando la cuenta de MANDI (ver
// lib/dlocal.js). `/api/pago-dlocal` se agrega a propósito, no por copiar de
// memoria: SOCIAL sigue sin existir en IND y sigue afuera.
//
// ⚠️ Agregar algo acá es abrir una puerta al internet entero. Si alguna vez hay
// que hacerlo, que sea con tráfico medido en la mano, como se hizo con esta lista.
export const RUTAS_PUBLICAS = [
  '/api/webhook',
  '/api/cron/seguimientos',
  '/api/cron/pendientes',
  // Aviso de mensajes que NO le llegaron al cliente, cada 30 min. Se sumó el
  // 21-ago junto con el cron: en MANDI se desplegó SIN esto y el cron nació
  // muerto — Vercel lo llamaba y el candado lo mandaba al login.
  '/api/cron/entregas',
  '/api/pago-dlocal',
]

/**
 * ¿Esta ruta queda fuera del candado?
 *
 * Compara la ruta completa o una subruta con separador, NUNCA con `startsWith`
 * a secas: si no, `/api/webhook-falso` pasaría por ser `/api/webhook`.
 */
export function esRutaPublica(pathname) {
  const p = String(pathname || '')
  return RUTAS_PUBLICAS.some((r) => p === r || p.startsWith(r + '/'))
}
