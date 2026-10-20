// lib/pedido-en-vivo.js — pedidos del catálogo que el chat abierto muestra SIN resolver.
//
// ☠️ EL BUG (20-oct-2026, visto en MANDI): el nombre y la foto de un pedido del
// catálogo se resuelven al leer el HILO (`conPedidosResueltos`,
// lib/inbox-supabase.js), y el hilo solo se leía al abrir el chat. Un pedido que
// llega con el chat YA abierto entra por el poll, que no trae el crudo de Meta, y
// se quedaba como "1 × $35.00 (8063557763165)" hasta volver a abrir o refrescar.
//
// `yaPedidos` son los ids que ya se mandaron a resolver: si la resolución falla
// (en IND pasa con los catálogos que el token no ve), no se vuelve a pedir el hilo
// en cada poll.
export function pedidosPorResolver(msgs, yaPedidos) {
  return (msgs || [])
    .filter((m) => m?.tipo === 'order' && !m.pedido && m.id && !yaPedidos?.has?.(m.id))
    .map((m) => m.id)
}
