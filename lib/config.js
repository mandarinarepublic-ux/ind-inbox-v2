// lib/config.js
// Los datos se leen directamente de Google Sheets vía Service Account.
// El envío ya NO pasa por Make: /api/saliente llama directo a la Cloud API de Meta.
export const CFG = {
  MAKE_SEND_WEBHOOK: '/api/saliente', // (nombre heredado) proxy interno → Meta directo
  POLL_INTERVAL: 20, // segundos entre polling (subido de 8 → baja Fast Origin Transfer ~2.5x)
  // Agente IA de IND que crea el pedido (botón CREAR PEDIDO). Ajusta al dominio real de indx-agent.
  AGENT_CREAR_PEDIDO_URL: 'https://indx-agent.vercel.app/api/crear-pedido',
}
