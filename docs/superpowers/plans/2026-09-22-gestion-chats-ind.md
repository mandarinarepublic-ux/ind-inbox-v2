# Gestión de chats IND — plan de implementación (fases 1, 2 y 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Rodrigo pidió ejecutar las tres fases de corrido (22-sep-2026), en `main`, implementación nativa.

**Goal:** reemplazar la temperatura manual y las bandejas Soporte/Encuesta/Venta por el modelo de capas del diseño (bandeja · temperatura automática · etapa · 📌 · 🤫 · etiqueta CRM · tipo de contacto), con alertas y reactivación.

**Architecture:** reglas en módulos PUROS y probados (`lib/temperatura.js`, `lib/gestion.js`, `lib/filtro-chats.js`, `lib/overrides.js`, `lib/promesas.js`, `lib/etiqueta-crm.js`, `lib/reactivacion.js`); la pantalla (`components/App.jsx`) y las rutas solo los llaman. Columnas nuevas por PERSONA en `inbox.conversaciones`. Etiqueta CRM por una vista `inbox.pedido_por_telefono` leída por un endpoint propio cada 5 min (no en la ruta caliente `/api/inbox-sync`).

**Tech Stack:** Next.js (app router), Supabase (PostgREST), `node --test` + eslint (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-22-gestion-chats-ind-design.md`

## Global Constraints

- Solo IND (`ind-inbox-next`). MANDI no se toca. La base es compartida: todo cambio de datos filtra `cuenta='IND'`.
- Siempre en `main`, sin ramas. `git add` con archivos explícitos (nunca `-A`). Commits en español (Ecuador, tuteo) con el trailer de Claude.
- Textos de la app en español ecuatoriano con tuteo.
- Toda columna que lea `toContacto` va en `COLS_CONTACTO` (lo exige `tests/columnas-contacto.test.js`).
- Nada nuevo en `/api/inbox-sync` más allá de columnas de `conversaciones`.
- Envíos automáticos del servidor: `urlPropia()` + `cabecerasMaquina()`; nunca `req.url`.
- Horario de silencio de automáticos: 22:00–08:00 hora Ecuador.
- La reactivación queda APAGADA (`config.reactivacion.activo=false`); la prende Rodrigo.
- Antes de afirmar un despliegue: `git status -sb` + SHA del deployment de producción en Vercel.

## Review Focus

1. Pestañas abiertas con el JS viejo mandan `estado=soporte/venta/encuesta`, `campo=temperatura/ventaEnProceso` → el servidor los traduce, nunca 500 ni chat escondido (`traducirEstadoLegado`, pruebas en Task 2).
2. Chat sin `ultimo_entrante_at` (solo salientes/plantilla) → sin temperatura, fuera de filtros de temperatura, sin error (Task 1/3).
3. El poll dentro de 35 s tras marcar etapa/📌 no revierte la pantalla (`aplicarOverrides`, Task 4).
4. Archivados nunca aparecen en filtros de etapa/📌/temperatura salvo con ⚫ (Task 3).
5. La IA deriva un chat que ya tiene 📌 del vendedor → vuelve a 🔴 y conserva la nota (`noPisar`, verificación SQL en Task 9).

---

## FASE 1 — capas, filtros y botones

### Task 0: Migración de columnas
- `apply_migration gestion_chats_fase1`: `etapa, etapa_por, etapa_at, deuda_nota, deuda_por, deuda_at, sin_automaticos (bool not null default false), tipo_contacto (text not null default 'cliente'), reactivacion_n (int not null default 0), reactivacion_at` + checks; `venta_en_proceso_at → etapa falta_pedido`.
- Verificar con SELECT que MANDI e IND siguen leyendo (columnas con default).

### Task 1: `lib/temperatura.js` (puro)
- `temperaturaDe(ultimoEntranteAt, ahoraMs) → 'caliente'|'tibio'|'frio'|'dormido'|''` (<1 h, 1–6, 6–24, ≥24; sin fecha o inválida → '').
- `horasDesde(iso, ahoraMs) → number|null`, `textoHoras(h)`, `TEMPERATURAS`.
- Pruebas: bordes 0.99/1/5.99/6/23.99/24, null, basura, fecha futura.

### Task 2: `lib/gestion.js` (puro)
- `ETAPAS`, `esEtapa`, `traducirEstadoLegado(valor) → {estado?, deuda?, etapa?}` (SOPORTE→PENDIENTE+📌 ia; ENCUESTA→ATENDIDO; VENTA→etapa falta_pedido).
- `necesitaConfirmarAtendido(ultimaDireccion)`, `alertaVentanaCierra(c, ahora)` (20–24 h, etapa 💬/💳 o 📌, no archivado, no interno), `deudaVieja(c, ahora)` (>12 h), `esperaCliente(c, ahora)` (min desde el entrante si está 🔴), `chipsDeChat(c, ahora)`.

### Task 3: `lib/filtro-chats.js` (puro)
- `FILTRO_INICIAL`, `alternar(f, dim, valor)`, `pasaFiltro(v, f)`, `conteos(vistas, f)`, `ordenarPorEspera(vistas)`; `v` = vista preparada con `estado, temp, etapa, deudaAt, deudaPor, alerta, tipoContacto`.

### Task 4: `lib/overrides.js` (puro)
- `aplicarOverrides(mapa, overrides, ahoraMs)`; `sumarOverride(overrides, tel, campos, ahoraMs, ttl=35000)`.

### Task 5: Datos y API
- `lib/inbox-supabase.js`: columnas nuevas en `COLS_CONTACTO`/`toContacto` (sin `temperatura` ni `venta_en_proceso_at`); `setCamposContacto`; `updateEtapaSupabase`, `updateDeudaSupabase(tel, nota, por, {noPisar})`, `updateSinAutomaticosSupabase`, `updateTipoContactoSupabase`, `derivarAPersonaSupabase`.
- `lib/contactos.js` envoltorios; `app/api/contactos/estado/route.js` casos `etapa|deuda|sinAutomaticos|tipoContacto` + legado; `lib/api-client.js`.
- `lib/capi.js`: `motivoPorEtapa` (💳/🛒 disparan InitiateCheckout; fuera 🔥/SOPORTE).

### Task 6: Pantalla — cabecera del chat
- Bandeja 🔴🟢⚫ (con freno al 🟢), etapa (4 botones), 📌 (prompt de nota / confirmar cumplido), 🤫, 🏷️. Fuera 🔥🌤️❄️, 💰, 🎧, 📋. `estadoAlResponder` = siempre `atendido`.

### Task 7: Pantalla — lista
- Estado `filtro` (objeto), filas de chips por dimensión con conteos, tic de 60 s, 🔴 ordenado por espera, `ContactRow` recibe `chips`. Notificación ⏰ con `alertaVentanaCierra`.

### Task 8: Flujos y seguimientos sin temperatura
- Motor sin `setTemperatura`; condición `temperatura` calculada por tiempo; editor sin "temperatura al llegar acá"; `decidirSeguimiento` sin temperatura y con candados 🤫/interno; cron sin bandeja ENCUESTA; Automatizaciones sin bloque de temperatura. Limpiar `temperatura` de los grafos IND. Prueba guardia: nadie escribe temperatura.

### Task 9: Desplegar fase 1 + migrar datos legados
- Build, push, SHA en Vercel. SQL idempotente: SOPORTE→PENDIENTE+📌🎧, ENCUESTA→ATENDIDO (2 corridas, la 2.ª toca 0). Verificación en vivo.

## FASE 2 — automático sin enviar nada

### Task 10: `lib/promesas.js` + 📌 🤖
- `detectarPromesa(texto) → {frase}|null` (lista del diseño, sin tildes/mayúsculas); en `/api/saliente` (no `auto`, tipo texto) prende 📌 `auto` con `noPisar`; si sale foto/video/documento ≤15 min después de un 📌 `auto`, se apaga.

### Task 11: Flujo pone etapa
- Nodo mensaje: "Etapa al llegar acá" (💬/💳); motor `setEtapa(tel, etapa)` solo si vacía (`etapaSiVacia`).

### Task 12: Etiqueta CRM + etapa que se borra al haber pedido
- Vista `inbox.pedido_por_telefono` (último pedido no cancelado por últimos 9 dígitos); `GET /api/pedidos-chat` → mapa; `lib/etiqueta-crm.js` `etiquetaPedido(p, ahora)` (EN_FABRICA 🏭, DESPACHO 📦, COMPLETADO 🚚 ≤7 días, ENTREGADO nada, ABONO 💳 saldo) y `etapaVigente(c, pedido)` (💬💳🛒 se ignoran si hay pedido posterior a `etapa_at`). La pantalla lo pide al cargar y cada 5 min.

### Task 13: Alertas en la lista
- Chips ⏳ (cliente esperando ≥10 min, 08:00–21:00), ⏰, 📌 viejo; filtros 📌/🎧/⏰.

### Task 14: Desplegar fase 2 + verificar.

## FASE 3 — reactivación (queda APAGADA)

### Task 15: `lib/reactivacion.js` (puro)
- `decidirReactivacion({config, contacto, pedido, ahoraMs}) → {toque, texto}|null` con todos los candados (último mensaje nuestro, sin 📌, sin 🤫, etapa 💬/💳, sin pedido, cliente, ventana <24 h, 08:00–22:00, toques a 3/12/20 h del último entrante, ≥2 h entre toques, máx 3).

### Task 16: Cron + contador + Automatizaciones
- En `/api/cron/seguimientos`: recorre, envía por `urlPropia`, marca `reactivacion_n/at`. `reactivacion_n=0` cuando escribe el cliente (webhook) o una persona (`/api/saliente` no auto). Bloque "Reactivación" en Automatizaciones con textos por etapa y toque, APAGADO.

### Task 17: Desplegar fase 3 (apagada) + documentación
- Handoff, manual (fases activas), memoria.
