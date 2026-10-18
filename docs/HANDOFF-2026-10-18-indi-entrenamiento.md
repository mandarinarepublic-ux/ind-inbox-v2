# HANDOFF 18-oct-2026 — Indi entrenada desde el inbox (🧠 INDI)

Diseño: `docs/superpowers/specs/2026-10-18-indi-entrenamiento-design.md` · Plan: `docs/superpowers/plans/2026-10-18-indi-entrenamiento.md` · Base semilla: `docs/indi/base-conocimiento-semilla.md` · SQL: `docs/indi/migracion-indi-entrenamiento.sql`

## En producción (verificado por SHA)
- ind-inbox-v2 → `65cd70c` · indx-agent → `56a3d96`.
- Base: `inbox.indi_conocimiento` (25 filas: 6 precios, 13 reglas, 1 pregunta; 5 precios SIN CONFIRMAR apagados), `inbox.indi_feriados` (7 de 2026), `inbox.indi_historial` (trigger), `respuestas_rapidas.uso_ia` (10 en false).
- `INBOX_API_TOKEN` NUEVO (18-oct) en ind-inbox-v2 (Production) e indx-agent (Production), mismo valor. Preview de ind-inbox-v2 quedó sin esa variable.

## Qué hace ahora
- Internos (🏷️) y 🤫: sin saludo, flujos ni Indi (webhook).
- Indi lee en cada mensaje: precios/promos (con precio y fecha fin), reglas, preguntas fijas, feriados, respuestas rápidas con `uso_ia`, y los pedidos INDSTORE del cliente (lo mismo que Ventas + etapa de /pedido + guía; fecha = `fecha_entrega_prometida` del CRM; atrasado → disculpa + persona).
- Fotos de respuestas rápidas: las elige el servidor, exactas. URLs inventadas se descartan.
- Pasa a persona (IA apagada primero, luego 📌): reclamos, atrasados, otra tienda, extras, B2B, foto/audio/video/documento del cliente, agente caído o sin base, respuesta vacía/cortada, traspaso que falló.
- Modelo `claude-sonnet-5-5`, max_tokens 2000.

## ⛔ Bloqueante para usarla
**La cuenta de Anthropic no tiene crédito** (log 18-oct 08:39Z: "credit balance is too low"). Hasta recargar, "Probar a Indi" da "Error interno del agente" y, en un chat con IA prendida, el inbox pasa el chat a una persona (no queda mudo).

## Corregido después (18-oct, con OK de Rodrigo)
- Respuestas rápidas: Envíos, "¡Así quedaría tu prenda!" y "Pedido confirmado" → **4 días laborables**. Horario → Quito **todos los días (domingo incluido) 10:30–6 pm** · Ibarra L–S 10:30–7 pm, domingo cerrado.
- Flujos publicados (ESTAMPADO GRATIS · NEURO, ALGO ÚNICO · NEURO, BUZOS BORDADOS · NEURO): "2 a 3" / "3 a 4 días" → **4 días laborables**; "anticipo del 50%" → "pago completo bajo $100 · 50% de anticipo desde $100" (grafo y grafo_vivo). Los flujos NO publicados no se tocaron.
- Agente: ver `indx-agent/HANDOFF.md`.

## Pendientes
- Recargar crédito de Anthropic → repetir la prueba del plan (Task 13 Step 4) en 🧠 INDI › Probar a Indi.
- Link de Maps de Ibarra (no aparece en ningún mensaje enviado); texto para "¿sirve para la costa?"; feriados 2027 cuando salga el calendario oficial.
- Dudosos de internos sin marcar: …9685, …5275.
- Indi NO está prendida con clientes: `IA_AUTORESPUESTA`, cortafuegos y `modo_ia` siguen como estaban.
- Menores diferidos (ver ledger en la revisión final): timeout propio al cargar pedidos, "probar" no muestra sinBase, 0 filas = ok, foto de la guía no se manda. (Arreglados el 18-oct: tope de 8 s a pedidos, Probar muestra sinBase/traspaso, precios estilo Ecuador, 404/409, validación activo/orden, aviso de promo vencida — ver docs/superpowers/reports/2026-10-18-indi-menores.md.)
