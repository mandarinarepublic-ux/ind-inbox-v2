# Indi: entrenamiento desde el inbox IND — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que Indi (indx-agent) responda con lo que Rodrigo y Xavier mantienen en un módulo del inbox IND (precios, promos, reglas, feriados, respuestas rápidas con sus fotos) y con el estado real del pedido del cliente, callando con los internos y pasando a una persona cuando corresponde.

**Architecture:** lo que Indi sabe vive en tablas nuevas del schema `inbox` (`indi_conocimiento`, `indi_feriados`, `indi_historial` por trigger) + `respuestas_rapidas`. indx-agent lo lee por REST en cada mensaje (ya tiene la service key, igual que `lib/conversacion.js`) y arma el prompt con una función PURA. Los pedidos los arma el inbox (misma búsqueda que la sección Ventas + etapa del CRM) y viajan en el cuerpo de la llamada al agente. Todo lo calculable (fechas, atrasos, qué fotos se mandan) lo calcula el servidor, nunca el modelo.

**Tech Stack:** Next.js 14 app router + Supabase (PostgREST) en `ind-inbox-next`; funciones Vercel Node + `@anthropic-ai/sdk` en `indx-agent`; pruebas `node --test` (en indx-agent se agrega el script).

**Spec:** `docs/superpowers/specs/2026-10-18-indi-entrenamiento-design.md` (+ `docs/indi/base-conocimiento-semilla.md`)

## Global Constraints

- Siempre en `main`, sin ramas, en los dos repos. `git add` con archivos explícitos (nunca `-A`: hay `reports/` y `research_notes/` sin seguimiento que no son nuestros). Commits en español ecuatoriano con tuteo, con el trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Textos de la app y de Indi en español ecuatoriano con **tuteo**. Nada de voseo.
- Base compartida con MANDI: migración UNA vez, con `apply_migration`; todo lo nuevo filtra `cuenta='IND'`. Columna nueva en tabla compartida = con default que no cambie nada para MANDI.
- PostgREST corta en 1000 filas en silencio. Lecturas de Supabase en Next con `cache: 'no-store'`.
- `/api/webhook` es la ruta más llamada: nada nuevo en el camino síncrono del 200 a Meta salvo lo ya existente; lo de Indi va dentro de `waitUntil`.
- `fetch` no lanza con 4xx/5xx: mirar `res.ok` siempre.
- Fechas a cliente en hora de Ecuador (`America/Guayaquil`); pruebas de fechas también con `TZ=UTC`.
- Indi NUNCA crea/edita pedidos. NUNCA cambia cifras. Lo que la base no responde → persona.
- Nada se escribe en datos de producción existentes (respuestas rápidas, conversaciones) sin el OK de Rodrigo. Las tablas nuevas sí se pueden sembrar.
- Indi NO se prende con clientes en este proyecto: `IA_AUTORESPUESTA`, el cortafuegos y `modo_ia` quedan como están.
- Antes de afirmar un despliegue: `git status -sb` + SHA del deployment de producción en Vercel (`ind-inbox-v2` y `indx-agent`).
- Quién edita el módulo: usuario del CRM con `rol='ADMIN'`, `activo=true` y `'INDSTORE'` en `tiendas`.
- Modelo: `claude-sonnet-5-5`.

## Review Focus

1. `fecha_entrega_prometida` es `timestamptz`: un pedido prometido "mié 5 nov" guardado como `2026-11-05T03:00Z` no puede salir como "mar 4". → prueba en Task 5 con TZ=UTC.
2. Promo con `vigente_hasta` = hoy sigue vigente hasta las 23:59 de Ecuador, y mañana desaparece sola. → prueba en Task 8.
3. Si indx-agent no puede leer la base (Supabase caído, 500), NO contesta con lo que recuerde: devuelve `{ reply:'', sinBase:true }` y el webhook pasa el chat a una persona. → pruebas en Task 8 y Task 6.
4. Cliente con pedidos en MANDARINA y en INDSTORE: a Indi solo le llegan los de INDSTORE. → prueba en Task 5.
5. Respuesta rápida con huecos en `imagenes` (`imgsFromExtras` conserva la posición 1 vacía) → se mandan solo las no vacías, en su orden, sin duplicar. → prueba en Task 9.

---

## Mapa de archivos

**ind-inbox-next**
- `lib/ia-canal.js` (modificar) — `contactoCallado`, `decidirIA` respeta internos.
- `app/api/webhook/route.js` (modificar) — automáticos callados, foto → vendedor, pedidos al agente, `imagenes`/`sinBase` de vuelta.
- `lib/crm-subestados.js`, `lib/crm-etapa-cliente.js` (crear) — COPIAS EXACTAS de `MANDARINACRM/lib/subestados.js` (solo `parseSubestados`) y `lib/etapaCliente.js`.
- `lib/pedidos-cliente.js` (crear) — la búsqueda de Ventas, extraída de `app/api/cliente-pedidos/route.js`.
- `lib/pedidos-indi.js` (crear) — puro: pedido del CRM → lo que Indi puede decir.
- `lib/editor-indi.js`, `lib/indi-validar.js` (crear) — permiso y validación.
- `app/api/indi/{conocimiento,feriados,respuestas,historial,probar}/route.js` (crear).
- `components/Indi.jsx` (crear), `components/App.jsx` (modificar: vista `INDI`).

**indx-agent**
- `package.json` (script `test`), `tests/` (crear).
- `lib/escalar.js` (modificar) — credencial de máquina + `res.ok`.
- `lib/fechas.js` (crear) — puro: días laborables.
- `lib/base.js` (crear) — leer la base por REST + `armarPrompt` puro.
- `lib/systemPrompt.js` (reescribir) — solo personalidad y conducta.
- `api/agent.js` (modificar) — base, pedidos, tool `mandar_respuesta_rapida`, `imagenes`, modelo, `source:'probar'`.

---

### Task 0: Migración `indi_entrenamiento`

**Files:** ninguna en repo (migración por `apply_migration`; el SQL se pega en el commit de Task 10 como `docs/indi/migracion-indi-entrenamiento.sql` para que quede la historia).

**Interfaces — Produces:**
- `inbox.indi_conocimiento(id uuid pk default gen_random_uuid(), cuenta text not null default 'IND', tipo text not null check (tipo in ('precio','promo','regla','pregunta')), titulo text not null, contenido text not null default '', precio numeric(10,2), vigente_hasta date, activo boolean not null default true, orden int not null default 0, actualizado_por text, actualizado_en timestamptz not null default now(), check (tipo <> 'promo' or vigente_hasta is not null), check (precio is null or precio >= 0))`
- `inbox.indi_feriados(cuenta text not null default 'IND', fecha date not null, nombre text not null, primary key (cuenta, fecha))`
- `inbox.indi_historial(id bigserial pk, cuenta text not null, tabla text not null, fila_id text not null, antes jsonb, despues jsonb, por text, en timestamptz not null default now())` + índice `(cuenta, en desc)`.
- `alter table inbox.respuestas_rapidas add column uso_ia boolean not null default true`.
- Función `inbox.indi_registrar_cambio()` + triggers `after insert or update or delete` en las tres tablas (`indi_conocimiento`, `indi_feriados`, `respuestas_rapidas`): si `coalesce(new.cuenta, old.cuenta) <> 'IND'` no hace nada; si no, inserta `{tabla: TG_TABLE_NAME, fila_id: (id o fecha)::text, antes: to_jsonb(old), despues: to_jsonb(new), por: coalesce(new.actualizado_por, null)}` (respuestas_rapidas no tiene `actualizado_por` → `por` null; usar `to_jsonb(new)->>'actualizado_por'`).

- [ ] **Step 1:** `apply_migration` con nombre `indi_entrenamiento` en el proyecto `piingkecjgoisnxccvaa`.
- [ ] **Step 2: Verificar** — `select count(*) from inbox.respuestas_rapidas where uso_ia` = total de filas (MANDI e IND); insertar y borrar una fila de prueba en `indi_conocimiento` → `indi_historial` tiene 2 filas nuevas con `antes`/`despues`; borrar esas 2 filas de historial.
- [ ] **Step 3: Verificar** que una fila de MANDI editada en `respuestas_rapidas` NO crea historial (`update ... set orden=orden where cuenta='MANDI' and id=<una>` → 0 filas nuevas).

### Task 1: Internos y 🤫 no reciben automáticos ni a Indi

**Files:** Modify `lib/ia-canal.js`, `app/api/webhook/route.js` (función `automaticosDe`, ~línea 485). Test `tests/ia-canal.test.js`.

**Interfaces — Produces:** `contactoCallado(contacto) → boolean` (true si `contacto?.tipoContacto === 'interno' || contacto?.sinAutomaticos === true`), exportada de `lib/ia-canal.js`.

- [ ] **Step 1: Pruebas que fallan** en `tests/ia-canal.test.js`:
  - `contactoCallado({tipoContacto:'interno'}) === true`, `({sinAutomaticos:true}) === true`, `({tipoContacto:'cliente'}) === false`, `(undefined) === false`.
  - `decidirIA({ config:{}, phoneId:'', contacto:{ modoIA:true, tipoContacto:'interno' } }) === false` y lo mismo con `sinAutomaticos:true`.
- [ ] **Step 2:** `node --test tests/ia-canal.test.js` → FAIL.
- [ ] **Step 3:** implementar `contactoCallado`; en `decidirIA`, después del cortafuegos y del `!contacto`, `if (contactoCallado(contacto)) return false`. En el webhook, primera línea de `automaticosDe(m)`: `if (contactoCallado(contactoDe(m.telefono))) return` (sin flujo en curso, sin flujo nuevo, sin saludo). El mensaje se sigue guardando y avisando por push como siempre.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5: Commit** `fix(webhook): los contactos internos y 🤫 ya no reciben saludo, flujos ni a Indi`.

### Task 2: El traspaso a persona deja de fallar callado (indx-agent)

**Files:** Modify `indx-agent/lib/escalar.js`, `indx-agent/api/agent.js` (`executeTool`), `indx-agent/package.json`. Create `indx-agent/tests/escalar.test.js`.

**Interfaces — Produces:** `escalarASoporte(phone, { fetchImpl = fetch } = {}) → Promise<{ ok: boolean, status?: number }>`. Cabecera `Authorization: Bearer ${INBOX_API_TOKEN}` (limpiada con `/[^\x21-\x7E]/g`, como `lib/auth-maquina.js` del inbox). Base: `INBOX_BASE` o `https://ind-inbox-v2.vercel.app`.

- [ ] **Step 1:** `package.json` → `"test": "node --test tests/"`.
- [ ] **Step 2: Pruebas que fallan** (`fetchImpl` falso que registra llamadas):
  - manda dos PATCH (`estado`=`SOPORTE`, `modoIA`=`HUMANO`) con `Authorization: Bearer <token>` cuando `process.env.INBOX_API_TOKEN='abc'` (fijar la variable antes de importar el módulo con `import()` dinámico).
  - si una respuesta es `{ ok:false, status:401 }` → devuelve `{ ok:false, status:401 }`.
  - sin `phone` → `{ ok:false }` y cero llamadas.
- [ ] **Step 3:** `npm test` → FAIL; implementar; → PASS.
- [ ] **Step 4:** en `executeTool('escalar_a_soporte')`: si `ok:false`, `console.error` con el status y devolver `{ escalado:false, instruccion:'...' }` que le diga a Indi responder igual con el mensaje de espera (el cliente no se queda sin respuesta) pero el log queda; la respuesta del agente lleva `escalado: ok` (Task 9 la usa).
- [ ] **Step 5: Commit** (indx-agent) `fix(escalar): mandar la credencial de máquina; un 401 ya no se calla`.
- [ ] **Step 6 (ops, al desplegar en Task 13):** variable `INBOX_API_TOKEN` en el proyecto Vercel `indx-agent` con el MISMO valor que en `ind-inbox-v2`.

### Task 3: Foto del cliente → se deriva al vendedor

**Files:** Modify `app/api/webhook/route.js` (bloque "Auto-respuesta IA", ~línea 613). Create `lib/foto-al-vendedor.js`. Test `tests/foto-al-vendedor.test.js`.

**Interfaces — Produces:** `esFotoParaVendedor(m) → boolean` (true si `m.tipo` ∈ `{'imagen','image'}`; ojo que en este repo conviven los dos nombres).

- [ ] **Step 1: Pruebas que fallan:** `esFotoParaVendedor({tipo:'imagen'})`, `({tipo:'image'})` → true; `({tipo:'texto'})`, `({tipo:'audio'})`, `({tipo:'sticker'})` → false.
- [ ] **Step 2:** implementar; en el webhook, junto a la rama de texto: si `agenteResponde(...) && esFotoParaVendedor(m)` y `getModoIA` relee encendida → `waitUntil(derivarAPersona(m.telefono, '📷 Mandó una foto').then(() => updateModoIA(m.telefono, 'HUMANO')))` (importar de `@/lib/contactos`; nunca lanza: `.catch` con `console.error`).
- [ ] **Step 3:** `npm test` → verde.
- [ ] **Step 4: Commit** `feat(webhook): si el cliente manda una foto con Indi prendida, el chat pasa al vendedor`.

### Task 4: La etapa del cliente, copiada del CRM

**Files:** Create `lib/crm-subestados.js` (solo `parseSubestados` y su helper `areasDelItem`), `lib/crm-etapa-cliente.js`. Test `tests/crm-etapa-cliente.test.js`.

**Interfaces — Produces:** `calcularEtapa({ pedido, items, logs, guia, ahora }) → { etapa: 0|1|2|3|4|null, fechas, cancelado }` y `ETAPAS_CLIENTE` idénticos al CRM; único cambio permitido: el import pasa a `./crm-subestados.js`.

- [ ] **Step 1:** copiar tal cual; cabecera `// ⚠️ COPIA EXACTA de MANDARINACRM/lib/etapaCliente.js (18-oct-2026). Si cambias uno, cambia el otro: Indi y la página /pedido tienen que decir lo mismo.` (mismo criterio que `lib/sesion.js`). ⚠️ `ETAPAS_CLIENTE[4].mensaje` dice "Mandarina": Indi usa solo `nombre`, nunca `mensaje`.
- [ ] **Step 2: Pruebas** (copiadas de los casos de la regla del encabezado): cancelado → `etapa:null, cancelado:true`; solo creado → 0; con `fecha_impresion_produccion` → 1; ítem `subestado_corte:'CORTADO'` → 2; `guia:{numero:'X'}` → 3; `estado_pedido:'COMPLETADO'` + `ahora` 25 h después → 4.
- [ ] **Step 3:** `npm test` → verde.
- [ ] **Step 4: Commit** `feat(indi): copia de la regla de etapas del CRM para hablar como la página /pedido`.

### Task 5: Pedidos para Indi (lo mismo que Ventas)

**Files:** Create `lib/pedidos-cliente.js`, `lib/pedidos-indi.js`. Modify `app/api/cliente-pedidos/route.js` (usa `buscarPedidosCliente`; salida idéntica a hoy). Test `tests/pedidos-indi.test.js`.

**Interfaces:**
- Consumes: `calcularEtapa`, `ETAPAS_CLIENTE` (Task 4).
- Produces:
  - `buscarPedidosCliente(crm, { telefono, idVenta }) → Promise<{ pedidos: Row[], items: Record<pedidoId, Row[]> }>` — la lógica actual de la ruta (cliente_conversacion + clientes.celular por últimos 9 dígitos + `idVenta`), con `tienda_id, monto_abonado, fecha_entrega_prometida, fecha_impresion_produccion, fecha_actualizacion, guia_numero, guia_transportista` agregados a las columnas, y en los ítems `area, subestado_corte`.
  - `cargarPedidosParaIndi({ telefono, idVenta }) → Promise<PedidoIndi[]>` — llama a lo anterior, se queda con `tienda_id === 'INDSTORE'`, los 5 más recientes, trae `logs_pedidos (fecha, campo, valor_despues)` y la última `guias_despacho` de esos pedidos, y aplica `pedidoParaIndi`.
  - `pedidoParaIndi({ pedido, items, logs, guia, ahora }) → PedidoIndi` PURO: `{ id, prendas:[{nombre,color,talla,cantidad}], etapa, etapaNombre, cancelado, fechaPrometida: 'miércoles 5 de noviembre'|'' , atrasado: boolean, saldoPendiente: boolean, guia: {numero, transportista, foto}|null }`.
    - `fechaPrometida`: `fecha_entrega_prometida` formateada con `Intl.DateTimeFormat('es-EC', { timeZone:'America/Guayaquil', weekday:'long', day:'numeric', month:'long' })`.
    - `atrasado`: hay fecha prometida, `ahora` > fin de ESE día en Ecuador, `etapa` < 3 y no cancelado.
    - `saldoPendiente`: misma regla que `tieneSaldoPendiente` del CRM (`estado_pago !== 'PAGADO'` y total − abonado ≥ 0.01).
    - `guia` solo si `etapa >= 3`; foto solo si empieza con `https://`.
- [ ] **Step 1: Pruebas que fallan** (`pedidoParaIndi`, correr también con `TZ=UTC node --test tests/pedidos-indi.test.js`):
  - `fecha_entrega_prometida:'2026-11-05T03:00:00Z'` (22:00 del miércoles 4 en Ecuador) → `'miércoles 4 de noviembre'` (quitar la coma que pone Intl).
  - `'2026-11-05T17:00:00Z'` → `'jueves 5 de noviembre'`.
  - atrasado: prometido `2026-11-05T17:00Z`, `ahora` = `2026-11-06T06:00Z` (01:00 del 6 en Ecuador), etapa 2 → `true`; mismo `ahora` con guía (etapa 3) → `false`; `ahora` = `2026-11-06T04:00Z` (23:00 del 5) → `false`.
  - saldo: total 40, abonado 20, `estado_pago:'PENDIENTE'` → true; `'PAGADO'` → false.
  - guía con etapa 2 → `guia:null`.
- [ ] **Step 2: Prueba que falla** para el filtro de tienda: con un `crm` falso que devuelve un pedido `MANDARINA` y uno `INDSTORE`, `cargarPedidosParaIndi` devuelve solo el de INDSTORE (Review Focus 4).
- [ ] **Step 3:** implementar; `app/api/cliente-pedidos/route.js` pasa a usar `buscarPedidosCliente` sin cambiar su JSON (verificar a mano con un teléfono real antes y después: misma salida).
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5: Commit** `feat(indi): Indi ve los pedidos de INDSTORE del cliente, con la etapa y la guía`.

### Task 6: El webhook le pasa los pedidos a Indi y respeta lo que devuelve

**Files:** Modify `app/api/webhook/route.js` (`responderConIA`). Create `lib/respuesta-indi.js`. Test `tests/respuesta-indi.test.js`.

**Interfaces:**
- Consumes: `cargarPedidosParaIndi` (Task 5); `contactoDe(phone).idVenta`.
- Produces: cuerpo al agente `{ phone, name, message, source:'webhook', pedidos: PedidoIndi[] }`; `envíosDeRespuesta(data) → { texto: string, imagenes: string[], derivar: boolean }` PURO:
  - si `data.sinBase === true` → `{ texto:'', imagenes:[], derivar:true }`.
  - si `Array.isArray(data.imagenes)` → esas (sin vacías, sin repetidas, en orden) y el texto SIN ninguna URL de imagen (`RE_IMG`).
  - si no (agente viejo) → lo de hoy: imágenes sacadas del texto con `RE_IMG`.
- [ ] **Step 1: Pruebas que fallan** de `envíosDeRespuesta` para los tres casos, más: `imagenes:['a.jpg','','a.jpg','b.png']` → `['a.jpg','b.png']`.
- [ ] **Step 2:** implementar; `responderConIA` carga pedidos (si falla → `[]`, nunca bloquea), usa `envíosDeRespuesta`, manda texto y luego fotos como hoy, y si `derivar` → `derivarAPersona(phone, '🧠 Indi no pudo leer su base')` + `updateModoIA(phone,'HUMANO')`.
- [ ] **Step 3:** `npm test` → verde.
- [ ] **Step 4: Commit** `feat(webhook): Indi recibe los pedidos del cliente y manda solo las fotos que le tocan`.
- [ ] Nota de orden: este task se despliega ANTES que Task 9 (el inbox nuevo entiende al agente viejo; al revés se perderían fotos).

### Task 7: Días laborables (indx-agent)

**Files:** Create `indx-agent/lib/fechas.js`, `indx-agent/tests/fechas.test.js`.

**Interfaces — Produces:**
- `hoyEcuador(ahora = new Date()) → 'YYYY-MM-DD'` (zona `America/Guayaquil`).
- `sumarLaborables(desdeYmd, n, feriados: Set<'YYYY-MM-DD'>) → 'YYYY-MM-DD'` — el día `desde` NO cuenta; se saltan sábados, domingos y feriados.
- `fechaLarga(ymd) → 'miércoles 5 de noviembre'`.
- [ ] **Step 1: Pruebas que fallan** (también con `TZ=UTC`): `sumarLaborables('2026-10-30', 4, new Set(['2026-11-02','2026-11-03']))` → `'2026-11-09'`; sin feriados → `'2026-11-05'`; desde sábado `'2026-10-31'`, 4 → `'2026-11-05'`; `hoyEcuador(new Date('2026-10-19T03:30:00Z'))` → `'2026-10-18'`; `fechaLarga('2026-11-05')` → `'jueves 5 de noviembre'`.
- [ ] **Step 2:** implementar (aritmética sobre fechas UTC a mediodía para no cruzar días); → PASS.
- [ ] **Step 3: Commit** (indx-agent) `feat(fechas): días laborables sin fines de semana ni feriados`.

### Task 8: Indi lee su base y arma el prompt (indx-agent)

**Files:** Create `indx-agent/lib/base.js`, `indx-agent/tests/base.test.js`. Rewrite `indx-agent/lib/systemPrompt.js`.

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `leerBase({ fetchImpl = fetch, ahora = new Date() } = {}) → Promise<{ ok:true, conocimiento, respuestas, feriados:Set } | { ok:false }>` — tres GET en paralelo a `${SUPABASE_URL}/rest/v1/...` con `Accept-Profile: inbox` (como `lib/conversacion.js`): `indi_conocimiento?cuenta=eq.IND&activo=is.true&or=(vigente_hasta.is.null,vigente_hasta.gte.<hoyEcuador>)&order=tipo,orden`; `respuestas_rapidas?cuenta=eq.IND&activo=is.true&uso_ia=is.true&select=id,texto,imagenes,grupo&order=orden`; `indi_feriados?cuenta=eq.IND&fecha=gte.<hoy>&select=fecha`. Cualquier `!res.ok` o excepción → `{ ok:false }`.
  - `armarPrompt({ conocimiento, respuestas, feriados, pedidos = [], nombre = '', ahora = new Date() }) → string` PURO. Secciones fijas en este orden: conducta (`CONDUCTA` de `systemPrompt.js`), hoy (`fechaLarga(hoyEcuador)`), "si paga hoy estaría listo el <fechaLarga(sumarLaborables(hoy,4,feriados))>; a provincia el envío toma 1 a 2 días más" (solo para cotizar; un pedido ya hecho usa SU fecha prometida), reglas, precios, promos vigentes (con "hasta el <fecha>"), preguntas fijas, respuestas rápidas (`[id] (grupo) texto · N fotos`), pedidos del cliente (o "no tiene pedidos de IND STORE"), nombre.
  - `systemPrompt.js` exporta `CONDUCTA` (texto): quién es Indi, tuteo ecuatoriano, mensajes cortos, sin markdown; no re-saludar a media conversación; nunca cambiar cifras ni inventar datos fuera de la base; usar `mandar_respuesta_rapida` para fotos; los casos de traspaso de la sección 6.5 del diseño (incluye pedido `atrasado` → disculpa + `escalar_a_soporte`, pedido de otra tienda, foto, sin respuesta en la base); nunca hablar como Mandarina; no mencionar Cumbayá/YAW. Se borra de ahí todo DATO (tallas, precios, envíos, tiempos) — ahora vienen de la base.
- [ ] **Step 1: Pruebas que fallan:**
  - `leerBase` con un `fetchImpl` que da 500 en una de las tres → `{ ok:false }` (Review Focus 3).
  - `leerBase` arma la URL de promos con la fecha de Ecuador: `ahora = 2026-11-06T04:00Z` → contiene `vigente_hasta.gte.2026-11-05` (Review Focus 2).
  - `armarPrompt` incluye `'listo el lunes 9 de noviembre'` con hoy viernes 30-oct y feriados 2 y 3-nov; incluye el título de una promo y su `'hasta el'`; con un pedido `atrasado:true` incluye la marca `ATRASADO`; con `pedidos:[]` incluye `'no tiene pedidos de IND STORE'`; no contiene `'Mandarina'` salvo en la prohibición.
- [ ] **Step 2:** implementar; `npm test` → PASS.
- [ ] **Step 3: Commit** (indx-agent) `feat(base): Indi lee precios, promos, reglas, feriados y respuestas de la base`.

### Task 9: El agente usa la base, manda las fotos exactas y cambia de modelo (indx-agent)

**Files:** Modify `indx-agent/api/agent.js`. Create `indx-agent/lib/fotos.js`, `indx-agent/tests/fotos.test.js`.

**Interfaces:**
- Consumes: `leerBase`, `armarPrompt` (Task 8), `escalarASoporte` (Task 2), cuerpo con `pedidos` (Task 6).
- Produces:
  - Tool nueva `mandar_respuesta_rapida` `{ id: string }` → el servidor agrega las fotos de ESA respuesta a la salida; devuelve al modelo `{ ok, texto }` para que adapte el texto. Id que no existe o con `uso_ia=false` → `{ ok:false }`.
  - `fotosDeRespuesta(respuesta) → string[]` PURO (sin vacías, en orden).
  - `fotosPermitidas(replyText, urlsDeTools: Set) → string[]` PURO: URLs de imagen del texto que aparecieron en resultados de tools de este turno (fotos de Shopify); el resto se descarta.
  - Respuesta HTTP: `{ reply, reply_clean, imagenes: string[], escalado: boolean, sinBase?: true, ... }` (`reply` sin URLs de imagen). `imagenes` = fotos de `mandar_respuesta_rapida` (en el orden de las llamadas) + `fotosPermitidas`.
  - `source === 'probar'` → nunca llama a `escalarASoporte` (devuelve `escalado:true` y `motivo` para que la caja de prueba lo muestre).
  - Modelo `claude-sonnet-5-5` en las dos llamadas.
- [ ] **Step 1: Pruebas que fallan:** `fotosDeRespuesta({ imagenes:['', 'a.jpg', 'b.jpg', ''] })` → `['a.jpg','b.jpg']` (Review Focus 5); `fotosPermitidas('mira https://x/a.jpg y https://y/z.png', new Set(['https://x/a.jpg']))` → `['https://x/a.jpg']`.
- [ ] **Step 2:** implementar; en el handler: `leerBase()` primero; si `!ok` → `200 { reply:'', imagenes:[], sinBase:true }` sin llamar a Claude. Si ok → `armarPrompt({...base, pedidos: req.body.pedidos || [], nombre:name})`.
- [ ] **Step 3:** `npm test` → PASS. Prueba manual local con `vercel dev` y `curl` (con `x-mandi-key`): "cuánto cuesta el hoodie" → precio $20 de la base; "me pasas el cuadro de tallas" → `imagenes` = las de la respuesta de tallas.
- [ ] **Step 4: Commit** (indx-agent) `feat(agent): Indi responde con la base, manda las fotos exactas de las respuestas rápidas y pasa a Sonnet 5.5`.

### Task 10: API del módulo (permiso, validación, historial, prueba)

**Files:** Create `lib/editor-indi.js`, `lib/indi-validar.js`, `app/api/indi/conocimiento/route.js`, `app/api/indi/feriados/route.js`, `app/api/indi/respuestas/route.js`, `app/api/indi/historial/route.js`, `app/api/indi/probar/route.js`, `docs/indi/migracion-indi-entrenamiento.sql`. Tests `tests/editor-indi.test.js`, `tests/indi-validar.test.js`.

**Interfaces — Produces:**
- `puedeEditarIndi(usuario) → boolean` PURO: `usuario?.activo === true && usuario?.rol === 'ADMIN' && (usuario?.tiendas || []).includes('INDSTORE')`.
- `usuarioDeSesion(req) → Promise<{ id, nombre, rol, tiendas, activo } | null>` — `verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secretoSesion())` y lee `crm.usuarios` (`cache:'no-store'`, como `lib/acceso.js`).
- `validarFila(fila) → { ok:true, fila } | { ok:false, error:string }` PURO: `tipo` válido; `titulo` 1–80; `contenido` ≤ 1500; `precio` número ≥ 0 o null (acepta `'20'`/`'20,5'` → 20 / 20.5); promo sin `vigente_hasta` o con fecha pasada → error `'La promo necesita una fecha de fin'` / `'La fecha de fin ya pasó'`.
- `validarFeriado({ fecha, nombre })` PURO: `YYYY-MM-DD` real y nombre 1–60.
- Rutas (todas `dynamic='force-dynamic'`; GET para cualquier sesión válida; POST exige `puedeEditarIndi` → si no, 403 `'Solo Rodrigo y Xavier pueden cambiar a Indi'`):
  - `/api/indi/conocimiento` GET → filas IND (incluye vencidas con `vencida:true`); POST `{ accion:'guardar', fila }` (upsert con `actualizado_por = usuario.nombre`, `actualizado_en = now`) | `{ accion:'borrar', id }`.
  - `/api/indi/feriados` GET/POST `{ accion:'guardar'|'borrar', fecha, nombre }`.
  - `/api/indi/respuestas` GET → `id, texto, grupo, imagenes, uso_ia` de IND; POST `{ id, usoIa }`.
  - `/api/indi/historial` GET → últimas 100 de IND; POST `{ accion:'deshacer', id }` → repone `antes` (si `antes` null = era un alta → borra la fila; si `despues` null = era un borrado → reinserta `antes`). Exige `puedeEditarIndi`.
  - `/api/indi/probar` POST `{ mensaje, historial }` → llama a `INDX_AGENT_URL` con `x-mandi-key: INDX_AGENT_KEY`, `phone:'593000000000'`, `source:'probar'`, `history` → devuelve `{ reply, imagenes, escalado, motivo }`. Cualquier sesión válida.
- [ ] **Step 1: Pruebas que fallan** de `puedeEditarIndi` (AND/XAV reales → true; `rol:'VENDEDOR'` → false; ADMIN sin INDSTORE → false; inactivo → false) y de `validarFila`/`validarFeriado` con cada error de arriba.
- [ ] **Step 2:** implementar; `npm test` → verde.
- [ ] **Step 3:** guardar el SQL de Task 0 en `docs/indi/migracion-indi-entrenamiento.sql`.
- [ ] **Step 4: Commit** `feat(indi): API del módulo de entrenamiento con permiso, validación e historial`.

### Task 11: Pantalla 🧠 INDI

**Files:** Create `components/Indi.jsx`. Modify `components/App.jsx` (lista de vistas ~línea 2287: `{ id:'INDI', label:'🧠 INDI' }`; render como `CONTACTOS`/`AUTO` ~línea 2805).

**Interfaces — Consumes:** las rutas de Task 10.

- [ ] **Step 1:** `Indi.jsx` con pestañas, en este orden: **Precios y promos** (primero: lo que más se toca) · **Reglas** · **Preguntas fijas** · **Respuestas rápidas** (lista con interruptor "Indi la usa") · **Feriados** · **Historial** (con Deshacer) · **Probar a Indi** (chat de prueba: texto + fotos devueltas + aviso "Aquí Indi pasaría el chat a una persona: <motivo>"). Paleta IND (objeto `C` de `components/Components.jsx`, crema/negro). Sin permiso de edición: todo visible, botones de guardar ocultos y una línea "Solo Rodrigo y Xavier pueden cambiar a Indi". Promos vencidas en gris con "venció el …". Errores de validación del servidor mostrados junto al campo.
- [ ] **Step 2:** `npm run build` → sin errores; `npm test` → verde.
- [ ] **Step 3: Verificación en el navegador** (`npm run dev` con `AUTH_MODO=observar` y las variables de Supabase): crear una promo de prueba → aparece; quitarle la fecha → error; Deshacer en Historial → vuelve; borrar la promo de prueba y sus filas de historial.
- [ ] **Step 4: Commit** `feat(indi): sección 🧠 INDI para entrenar a Indi desde el inbox`.

### Task 12: Sembrar la base y corregir lo que contradice las reglas

**Files:** ninguno (datos), salvo actualizar `docs/indi/base-conocimiento-semilla.md` si algo cambia.

- [ ] **Step 1:** insertar en `indi_conocimiento` (cuenta IND, `actualizado_por:'SEMILLA'`) desde la semilla: `regla` = las 12 de la sección 9 + "producción 4 días laborables" + cómo vender (sección 6) + objeciones (sección 7) + marca/material/tiendas/pagos/envíos como reglas cortas; `precio` = tabla del 27-sep (hoodie, cierre, camiseta por cantidad, +$2 2XL–5XL, estampado incluido); `pregunta` = "¿dónde quedan?" con direcciones y horarios. Lo marcado ❓/⚠️ en la semilla (oversize, camiseta 100 % algodón, extras históricos, jacket $80/$50, seguidores) entra con `activo=false`.
- [ ] **Step 2:** feriados: cargar los que quedan de 2026 y los de 2027 **desde el calendario oficial de feriados de Ecuador publicado por el gobierno** (con los traslados por decreto). Mostrarle a Rodrigo la lista antes de insertarla.
- [ ] **Step 3:** links de Maps: `select id, texto from inbox.respuestas_rapidas where cuenta='IND' and texto ilike '%maps%'` y ubicaciones enviadas (`mensajes` tipo ubicación, SALIENTE) → si hay link de cada tienda, va en la pregunta "¿dónde quedan?"; si no, queda la dirección escrita y se le pide a Rodrigo.
- [ ] **Step 4:** respuestas rápidas que contradicen: `select id, texto from inbox.respuestas_rapidas where cuenta='IND' and activo and (texto ilike '%5 pm%' or texto ilike '%5pm%' or texto ilike '%2 a 3 d%' or texto ilike '%sin compromiso%')` → mostrarle a Rodrigo el antes/después propuesto (6 pm; 4 días laborables; boceto simple antes del pago). **Cambiar solo con su OK**, por el editor o por SQL con guardia en el WHERE (queda en historial por el trigger).
- [ ] **Step 5:** con Rodrigo, marcar `uso_ia=false` en encuesta y cupón 10 % (y las que él diga).
- [ ] **Step 6:** pregunta "¿sirve para la costa?": si Rodrigo da el texto, se carga; si no, queda sin cargar y Indi pasa esa pregunta a una persona.

### Task 13: Desplegar y probar de punta a punta

- [ ] **Step 1: Orden de despliegue:** `ind-inbox-v2` (Tasks 1, 3–6, 10, 11) primero → `indx-agent` después (Tasks 2, 7–9). `git status -sb` limpio y empujado en los dos; SHA del deployment de producción = último commit en cada proyecto.
- [ ] **Step 2: Variables:** `indx-agent` tiene `INBOX_API_TOKEN` (= el del inbox), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`; `ind-inbox-v2` tiene `INDX_AGENT_KEY` (= `MANDI_API_KEY` del agente). Recordar que en Edge la variable entra al compilar: redesplegar tras cambiarla.
- [ ] **Step 3: Crédito:** una llamada a `/api/indi/probar` ("hola") responde texto → hay crédito en Anthropic. Si da error de saldo, avisarle a Rodrigo y parar.
- [ ] **Step 4: Probar a Indi** desde la sección 🧠 INDI con el guion de la prueba del 17-oct: precio del hoodie ($20, 1 estampado ≤29 cm), ubicación (Quito + Ibarra con horarios correctos), costa (no inventa "fresca": pasa a persona o usa la pregunta fija), tallas (manda la foto del cuadro EXACTA), "si pago hoy cuándo está" (día concreto con feriados), "quiero reembolso" (pasa a persona), "es para 40 camisetas del colegio" (pasa a persona).
- [ ] **Step 5: Traspaso real:** en el chat de pruebas de Rodrigo (…8489, que es INTERNO → con Indi NO debe pasar nada: verificar que no hay saludo ni respuesta). Luego, con un chat de prueba que Rodrigo indique en modo IA y `IA_AUTORESPUESTA` como esté: si está apagada, el traspaso se prueba con `curl` al agente con ese teléfono → el chat aparece en 🔴 con 📌 y `modo_ia='HUMANO'` en la base.
- [ ] **Step 6:** handoff `docs/HANDOFF-2026-10-xx-indi-entrenamiento.md` (qué quedó, variables, cómo se prende Indi, pendientes) y actualizar la memoria `indi-reentrenamiento-reglas`.
