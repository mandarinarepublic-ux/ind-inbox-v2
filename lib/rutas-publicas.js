// Las ÚNICAS rutas del inbox de IND que nunca piden sesión, porque quien las
// llama no puede tener una. Salen del inventario MEDIDO del 8-ago-2026
// (docs/INVENTARIO-RUTAS-IND-2026-08-08.md), no de la memoria de nadie.
//
// Cada una se defiende sola:
//   /api/webhook           → firma de Meta con META_APP_SECRET (7.880 llamadas en 3 días)
//   /api/cron/seguimientos → CRON_SECRET (3 llamadas en 3 días)
//
// ⚠️ Son DOS, no cuatro: a diferencia de MANDI, IND **no tiene** SOCIAL
// (`/api/social/*`) ni dLocal (`/api/pago-dlocal`). No copies la lista de MANDI
// de memoria: acá esas rutas ni existen y agregarlas sería abrir puertas a la nada.
//
// ⚠️ Agregar algo acá es abrir una puerta al internet entero. Si alguna vez hay
// que hacerlo, que sea con tráfico medido en la mano, como se hizo con esta lista.
export const RUTAS_PUBLICAS = [
  '/api/webhook',
  '/api/cron/seguimientos',
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
