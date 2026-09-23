# HANDOFF 22-sep-2026 — Gestión de chats en IND (fases 1, 2 y 3)

Diseño: `docs/superpowers/specs/2026-09-22-gestion-chats-ind-design.md`
Plan: `docs/superpowers/plans/2026-09-22-gestion-chats-ind.md`
Manual para vendedores: https://claude.ai/artifact/Wb5EWyFrizAgxz36wjooNr

## Qué quedó en producción

| Commit | Qué |
|---|---|
| `b02af05` | Crons de seguimientos y flujos se llamaban por `req.url` (despliegue protegido → 401 en silencio, CERO seguimientos en la historia). Ahora `lib/url-propia.js`. |
| `598ef40` | **Fase 1**: bandeja 🔴🟢⚫, temperatura automática (🔥<1h 🌤️1–6h ❄️6–24h 💤>24h), etapa 💬💳🛒🔁, 📌 le debemos, 🤫, 🏷️ interno, filtros combinables, freno al 🟢, flujos con "etapa al llegar acá", InitiateCheckout por 💳/🛒. |
| `bc40eea` | **Fase 2**: 📌 🤖 por promesa (`lib/promesas.js`), etiqueta CRM (🏭 📦 🚚 💳) vía vista `inbox.pedido_por_telefono` + `/api/pedidos-chat`, etapa que se da por cumplida con pedido posterior. |
| `2b192bd` | **Fase 3**: reactivación por etapa (`lib/reactivacion.js`) en el cron horario. **APAGADA.** |

Migraciones: `gestion_chats_fase1` (columnas por persona en `inbox.conversaciones`), `inbox_pedido_por_telefono` (vista).
Datos: 3 chats SOPORTE → 🔴 + 📌 🎧; 3 💰 → 🛒; flujos NEURO 🔥 → 💬 Cotizando; `…159804` (número propio) marcado interno. Corrida dos veces: la segunda tocó 0.

## Verificado en vivo
- Los flujos ponen etapa (2 chats con 💬 🤖 minutos después del despliegue).
- Sin errores nuevos en los despliegues de fase 1, 2 y 3.
- 682 pruebas + lint (solo el warning viejo de RightPanel) + build.

## NO verificado todavía
- 📌 🤖 por promesa: ningún vendedor escribió una promesa entre el despliegue y el cierre. Revisar: `select deuda_nota, deuda_at from inbox.conversaciones where cuenta='IND' and deuda_por='auto'`.
- Pantalla nueva: nadie había recargado el inbox al cierre (0 llamadas a `/api/pedidos-chat`).
- Reactivación: apagada. Al prenderla, mirar la respuesta del cron (`/api/cron/seguimientos`, `detalle.enviados` con `motivo: reactivacion_N`).

## Decisiones que no están en el diseño original
- Reactivación como bloque de AUTOS con textos por etapa y toque (no un flujo del lienzo).
- 🔴 ordena por espera SOLO dentro de 24 h; lo más viejo va al final (si no, un pendiente de 3 semanas tapa a uno de 40 min).
- DESPACHO = "📦 Por despachar" (supuesto; COMPLETADO = despachado, confirmado por Rodrigo).
- La etiqueta CRM se pide cada 5 min, fuera de `/api/inbox-sync` (ruta caliente).

## Pendientes
- Prender la reactivación y revisar los textos (AUTOS → "Reactivación de clientes callados").
- Confirmar si `…573550` (fotos de bordado con códigos de pedido, pide insumos) es interno y marcarlo 🏷️.
- `/api/inbox-sync` tiene `statement timeout` desde antes de estos cambios (159 en el despliegue previo, ~20 por despliegue). No es de esta obra; merece su propia revisión.
- MANDI: tiene el mismo bug de `req.url` en sus crons (también 0 seguimientos). No se tocó.
- Retirar `conversaciones.venta_en_proceso_at` y `conversaciones.temperatura` cuando se confirme que nadie las lee (la vista de dashboard todavía cuenta temperatura).

## Actualización 23-sep (revisión independiente + flujos)

| Commit | Qué |
|---|---|
| `c193686` | Arreglos de la 1.ª revisión (C1, C2, I1–I9) + horarios de la reactivación editables en AUTOS. Columna nueva `ultimo_humano_at`. |
| `711d243` | Arreglos de la 2.ª revisión: una persona ya no reinicia el contador (I-A); la reserva exige en la base ATENDIDO, sin 📌/🤫 y sin mensajes nuevos (I-B); horas en desorden. |
| `5992338` | Flujos: salida "📸 Manda foto" en nodos con botones (sin línea = 'otra', como antes) y "📌 le debemos al llegar acá". |

Datos: los 3 NEURO tienen `pregunta —foto→ m_gracias` y `m_gracias.deuda` ("enviar boceto" / "confirmar diseño (taller)"), en `grafo` y `grafo_vivo`.
"IND - Cliente listo para pagar": etapa 💳 puesta, pero es un BORRADOR VACÍO (mensaje sin texto, sin líneas): no publicar así.
Veredicto de la 2.ª revisión: fases 1 y 2 OK; reactivación se puede prender (empezar solo con 💳, textos de 💬 vacíos, mirar 48 h).
