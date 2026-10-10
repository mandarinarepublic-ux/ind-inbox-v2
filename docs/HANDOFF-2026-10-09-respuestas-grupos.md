# HANDOFF 9-oct-2026 — Respuestas rápidas en grupos (IND) y ajustes

Contexto completo de la sesión (incluye la sección 🚚 GUÍAS, que es solo de MANDI): `wa-inbox-next/docs/HANDOFF-2026-10-09-guias-servientrega.md`.

## Hecho (IND, producción)

| Commit | Qué |
|---|---|
| `9fbd6f2` (7-oct) | Reactivación: toques hasta 7 días (`MAX_HORA_TOQUE = 167`) a quien llegó de un anuncio, mientras su ventana de pauta siga abierta. Después de 24 h solo toques ≥24 h. |
| `20a9d34` (7-oct) | Reaccionar con emoji a los mensajes del cliente (`lib/reacciones.js`, igual que MANDI). |
| `659c6c9` | **Respuestas rápidas en grupos**, igual que MANDI con la paleta crema/negro: `Todas · 📋 Datos · 🛍️ Productos · 📐 Tallas` + grupo al crear/editar + ↑↓ dentro del grupo. |
| `e6db844` | **📦 Postventa**, cuarto botón SOLO en IND (`lib/grupos-respuestas.js` de IND tiene 4 grupos, el de MANDI 3: ⚠️ ya no son idénticos). |
| `5a43137` | Celular del cliente en la cabecera del chat de 9 px a 12 px. |

**Clasificación inicial (35 activas):** 5 Datos (cuentas, envíos, tiendas, horario, compra segura), 14 Productos, 2 Tallas (medidas, cortes), 11 Postventa (pedido confirmado, prenda lista ×2, salió, disculpas, cuidados, garantía, Golden Ticket, reseñas ×2, consulta de pedido), 5 sin grupo (saludo, boceto, seguimiento, encuesta, cupón 10 %). Se cambia con ✏️.

## Todavía NO
- La config del 3.er toque de reactivación a 48 h (con textos por etapa) espera el visto bueno de Rodrigo: no se escribió.
- Reacciones sin probar con un cliente real en IND.
