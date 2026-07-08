// lib/config.js
// Con la migración a Next.js los datos se leen directamente de Google Sheets
// via Service Account. Solo queda configurable el webhook de envío de Make.
export const CFG = {
  MAKE_SEND_WEBHOOK: '/api/saliente', // proxy interno → Make
  POLL_INTERVAL: 8, // segundos entre polling
  // Agente IA de IND que crea el pedido (botón CREAR PEDIDO). Ajusta al dominio real de indx-agent.
  AGENT_CREAR_PEDIDO_URL: 'https://indx-agent.vercel.app/api/crear-pedido',
}
