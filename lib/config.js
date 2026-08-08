// lib/config.js
// Los datos se leen directamente de Google Sheets vía Service Account.
// El envío ya NO pasa por Make: /api/saliente llama directo a la Cloud API de Meta.
export const CFG = {
  MAKE_SEND_WEBHOOK: '/api/saliente', // (nombre heredado) proxy interno → Meta directo
  POLL_INTERVAL: 20, // segundos entre polling (subido de 8 → baja Fast Origin Transfer ~2.5x)
  // Acá estaba `AGENT_CREAR_PEDIDO_URL` (indx-agent /api/crear-pedido), la única
  // clave que alguien todavía leía. Se fue con el botón "🤖 CREAR PEDIDO CON IA".
  // No confundir con `INDX_AGENT_URL` del webhook: esa es la IA que CONTESTA los
  // chats y sigue viva.
}
