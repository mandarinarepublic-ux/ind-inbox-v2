# HANDOFF — Gestión de chats en IND (22–23 sep 2026)

> Estado al 23-sep-2026. Leer junto con el diseño y el plan:
> - Diseño: `docs/superpowers/specs/2026-09-22-gestion-chats-ind-design.md`
> - Plan: `docs/superpowers/plans/2026-09-22-gestion-chats-ind.md`
> - Manual para vendedores (compartido con enlace): https://claude.ai/artifact/Wb5EWyFrizAgxz36wjooNr
> - Skill: `.claude/skills/inbox-mandarina/SKILL.md` (trampa 10: crons por `req.url`)

## 1. Qué hay en producción

| Capa | Cómo funciona | Dueño |
|---|---|---|
| Bandeja 🔴🟢⚫ | Cliente escribe → 🔴 siempre. Persona contesta → 🟢. Freno al marcar 🟢 con el cliente de último. Soporte/Encuesta/Venta ya no son bandejas. | sistema + vendedor |
| Temperatura 🔥🌤️❄️💤 | Calculada al pintar desde `ultimo_entrante_at` (<1 h, 1–6, 6–24, ≥24). Nadie la escribe (prueba guardia `tests/sin-temperatura-manual.test.js`). | reloj |
| Etapa 💬💳🛒🔁 | `conversaciones.etapa/etapa_por/etapa_at`. El flujo solo la pone si está vacía. 💬💳🛒 se dan por cumplidas si hay pedido posterior (`etapaVigente`). | vendedor (+ flujo) |
| 📌 Le debemos | `deuda_nota/por/at`. `por`: humano · auto (promesa detectada o nodo de flujo) · ia (derivación de `indx-agent`, antes SOPORTE). Solo lo apaga una persona; el 📌 auto se apaga si sale foto/PDF ≤15 min. | vendedor (+ auto) |
| 🤫 / 🏷️ interno | `sin_automaticos`, `tipo_contacto`. Internos fuera de alertas, reactivación, Telegram y CAPI. `…159804` ya marcado. | vendedor |
| Etiqueta CRM 🏭📦🚚💳 | Vista `inbox.pedido_por_telefono` → `/api/pedidos-chat` cada 5 min. COMPLETADO = despachado (🚚 7 días). DESPACHO = 📦 (supuesto). | CRM |
| Filtros | Combinables con conteos facetados, memorizados. 🔴 ordenado por espera dentro de 24 h. | — |
| Señal a Meta | InitiateCheckout por 💳/🛒 (+ foto, 6 mensajes). Ya no por 🔥/SOPORTE. | — |
| Flujos | "Etapa al llegar acá", "📌 le debemos al llegar acá", salida "📸 Manda foto" en nodos con botones. Condiciones por temperatura calculada y por etapa. | — |
| Reactivación | `lib/reactivacion.js` en el cron horario. **APAGADA.** Horarios y textos editables en AUTOS con límites (06:00–22:00, máx. 3 toques). | sistema |

## 2. Commits

| Commit | Qué |
|---|---|
| `b02af05` | Crons por `req.url` → 401 (cero seguimientos en la historia). `lib/url-propia.js`. |
| `598ef40` | Fase 1: capas, filtros, botones, flujos con etapa, CAPI por etapa. |
| `bc40eea` | Fase 2: 📌 por promesa, etiqueta CRM, etapa cumplida por pedido. |
| `2b192bd` | Fase 3: reactivación (apagada). |
| `c193686` | 1.ª revisión independiente (C1, C2, I1–I9) + horarios editables. Columna `ultimo_humano_at`. |
| `711d243` | 2.ª revisión: persona no reinicia el contador; reserva estricta en la base. |
| `5992338` | Flujos: salida 📸 y 📌 al llegar. |

Migraciones: `gestion_chats_fase1`, `inbox_pedido_por_telefono`, `conversaciones_ultimo_humano_at`.

## 3. Datos tocados (idempotentes, corridos dos veces)
- 3 chats SOPORTE → 🔴 + 📌 🎧; 3 💰 → 🛒; ENCUESTA → 🟢 (había 0).
- Flujos NEURO: temperatura → etapa (🔥 → 💬); `pregunta —foto→ m_gracias`; `m_gracias.deuda` = "enviar boceto" / "confirmar diseño (taller)".
- "IND - Cliente listo para pagar": etapa 💳 puesta; es un BORRADOR VACÍO (sin texto ni líneas), sin publicar.
- Config AUTOS: encuesta del cupón y reglas por temperatura APAGADAS.

## 4. Verificado en vivo / no verificado
- ✅ Flujos ponen 💬 🤖 en chats reales; sin errores nuevos en ningún despliegue; 694 pruebas + lint + build.
- ✅ Dos revisiones independientes: fases 1 y 2 OK; reactivación **se puede prender**.
- ⏳ 📌 🤖 por promesa: sin caso real todavía (revisar `deuda_por='auto'`).
- ⏳ Que los vendedores recarguen el inbox y lean el manual.

## 5. Cómo prender la reactivación (recomendado)
AUTOS → "Reactivación de clientes callados": vaciar los 3 textos de 💬 Cotizando, Guardar, prender. Mirar 48 h la respuesta del cron (`/api/cron/seguimientos` → `detalle.enviados`, motivo `reactivacion_N`). Luego reponer los textos de 💬.

## 6. Pendientes
**Clientes:** IND-XAV-6044 (`…699942`, amenaza de denuncia, sin respuesta); `…917533` (B2B, fuera de 24 h: plantilla); `…928041` y `…512503` con preguntas sin contestar.
**Decisiones:** prender reactivación; ¿`…573550` es interno?; encuesta del cupón; confirmar DESPACHO; contenido del flujo "Cliente listo para pagar"; revisar en ALGO ÚNICO que "otra respuesta" de "¿Cómo te gustaría tu pedido?" manda cualquier texto a "Ya se lo paso a nuestro diseñador".
**Técnico:** MANDI (análisis de port en curso); `statement timeout` de `/api/inbox-sync` (previo a esta obra); retirar `venta_en_proceso_at` y `temperatura` (dashboard aún la cuenta); plantillas para >24 h; guía en 🚚 (despacho debe cargar `guia_numero`).

## 7. Trampas nuevas de esta obra
- Un cron que se llama por `req.url` pega a la URL protegida del despliegue → 401 y 200 igual.
- Todo automático (flujo, IA, cron) sale con `auto:true`: no cuenta como atención, no prende 📌, no toca `ultimo_humano_at`.
- La reactivación RESERVA antes de enviar (UPDATE condicional); si el envío falla, el toque se pierde a propósito.
- Merge de AUTOS es de un nivel: los bloques se guardan COMPLETOS.
