# Gestión de chats en IND: bandeja, temperatura, etapa, 📌 y reactivación

> Diseño aprobado por Rodrigo el 22-sep-2026. Solo IND (`ind-inbox-next`); MANDI queda igual hasta decidir.
> Guía para vendedores (lenguaje simple): se publica aparte como página.

## 1. Por qué

La "temperatura" de hoy mezcla tres cosas en un botón: una nota del vendedor, el disparador
de un mensaje automático y una señal a Meta (InitiateCheckout). Además:

- Los flujos NEURO ponían 🌤️ a **todos** los que entraban (242/242, antes de que el cliente
  contestara) y 🔥 al recibir la foto (51 desde el 20-sep; 1 con pedido).
- Nunca bajaba: 56 🔥 ya tenían pedido. La lista 🔥 era un archivo histórico.
- El seguimiento automático por temperatura **nunca mandó nada** (401 de Vercel, arreglado en
  `b02af05`) y hoy está apagado a propósito.
- 💰 "Venta en proceso" escondía chats (bandeja `venta` + pestaña filtrando por `id_venta`).

### Lo que midieron 30 conversaciones reales (22-sep, 17 ventas + 11 perdidas + 2 internas)

| Hallazgo | Dato |
|---|---|
| Pedido creado tarde en el CRM | 9 de 16 ventas: entre 16 h y 12 días después del pago (mediana ~81 h). Con una lista nocturna: ~716 h menos entre las 9. 5 veces se dijo "ya le ingresé su pedido" sin que existiera. |
| Deudas nuestras que el cliente tuvo que reclamar | 20 de 28 conversaciones (boceto 6,5 días, guía 5 días, "ya le reviso" y 8 días de silencio). Causa: contestamos → 🟢 → desaparece. |
| Por qué se pierden ventas | 7 de 11 por nosotros: no contestamos (3) o no mandamos total/cuenta ni empujamos el cierre (4). 2 por precio, 2 B2B con ciclo largo. |
| Reactivación automática | Ayuda en 5 perdidas con intención clara de pago. Daña a 1 h, tras "pago mañana", tras una queja, a internos y a quien compró con otra vendedora. No se dispara donde más haría falta (el cliente habló último y no le contestamos). |
| Contactos que no son clientes | 2 de 30 (número interno que reenvía pedidos, taller de bordado). |
| Chats marcados 🟢 con el último mensaje del cliente sin contestar | 3 |
| Crisis evitable | "ayer fue enviado" con el pedido EN_FABRICA y sin guía (IND-XAV-6044). |
| Respuesta de clientes | 88,7 % contesta en <1 h; 94 % en <6 h (7.026 respuestas, 30 días). |

El aviso de "chats sin contestar" por Telegram (`/api/cron/pendientes`) **sí funciona** (187 chats
avisados en 7 días), pero no se ve donde trabaja el vendedor.

## 2. El modelo: siete capas, cada una con un solo dueño

Lo que ve el vendedor en la fila y en la cabecera del chat:

```
🔴 ❄️ · 🛒 Falta pedido · 📌 ya le reviso · 🏭 IND-XAV-6085
```

**Regla de oro:** un mensaje del cliente **solo mueve la bandeja** (→ 🔴). Nunca borra etapa, 📌,
🤫, tipo de contacto ni etiqueta del CRM.

### 2.1 Bandeja — de quién es el turno

| Valor | Cuándo |
|---|---|
| 🔴 Pendiente | el cliente escribió (siempre, venga de donde venga, incluso de ⚫) |
| 🟢 Atendido | contestamos (humano), o a mano |
| ⚫ Archivado | a mano |

- Se eliminan como bandeja: 🎧 Soporte (→ etapa 🔁), 📋 Encuesta (→ reactivación), 💰 Venta (→ etapa 🛒).
- **Freno:** marcar 🟢 a mano cuando el último mensaje es del cliente pide confirmar
  ("¿Lo contestaste por otro lado? El cliente escribió de último"). No bloquea: un "gracias 👍"
  no necesita respuesta.
- Los archivados no aparecen en los filtros de temperatura, etapa, 📌 ni CRM salvo que se filtre ⚫.
- Sin cambios en cómo se guarda: `inbox.bandeja` por canal + `conversaciones.estado` (lado viejo).

### 2.2 Temperatura — cuánto hace que habló el cliente

`horas = ahora − conversaciones.ultimo_entrante_at` (el mismo reloj que la ventana de 24 h de Meta).

| Temp | Horas |
|---|---|
| 🔥 | < 1 |
| 🌤️ | 1 – 6 |
| ❄️ | 6 – 24 |
| 💤 | ≥ 24 (ventana cerrada: solo plantilla) |

- **Se calcula al pintar, no se guarda.** Sin cron, sin escrituras, nunca se queda pegada.
- **No manda nada.** Es solo información y filtro.
- No depende del turno: `🔴 ❄️` = "me escribió hace 8 h y no le contesté" (lo más urgente).
- Se eliminan: botones 🔥🌤️❄️ del chat, `temperatura` en nodos de flujo (editor, motor y los
  3 flujos NEURO), bloque "seguimiento por temperatura" de Automatizaciones y la regla
  `caliente` → InitiateCheckout. La columna `conversaciones.temperatura` queda como historia, sin leerse.

### 2.3 Etapa — en qué va la venta (un valor)

| Etapa | Significa | Quién la pone |
|---|---|---|
| (vacía) | recién llegó / consulta | — |
| 💬 Cotizando | armando diseño/propuesta | vendedor, o 🤖 flujo al recibir foto/idea |
| 💳 Esperando pago | dijo que sí, falta transferencia | vendedor, o 🤖 flujo |
| 🛒 Falta pedido | pagó, falta crear el pedido en el CRM | vendedor |
| 🔁 Postventa | cambio, reclamo, entrega | vendedor |

- **El flujo solo escribe si la etapa está vacía.** Nunca pisa al vendedor. Se guarda quién (`humano`/`flujo`) y cuándo; la fila muestra 🤖/👤.
- **Al crearse un pedido del cliente** (cualquier tienda, cruzado por teléfono) se borran solos 💬 💳 🛒. 🔁 no.
- Los 3 chats con `venta_en_proceso_at` pasan a 🛒 y la columna se retira.

### 2.4 📌 Le debemos algo — aparte de la etapa

- Encendido con una **nota** ("boceto", "guía", "ya le reviso"). Convive con cualquier etapa.
- **Solo lo apaga el vendedor**, con una excepción: un 📌 🤖 (automático) se apaga solo si en los
  **15 min** siguientes mandamos una foto, video o documento (la promesa se cumplió al toque).
- Mientras está encendido, la reactivación **nunca** le escribe al cliente.

#### Detección automática de promesas (📌 🤖)

- Se evalúa en `/api/saliente` sobre mensajes de texto **escritos por un humano** (no `auto`, no flujo, no respuesta rápida con adjuntos).
- `lib/promesas.js` (puro, probado): `detectarPromesa(texto) → { frase } | null`. Lista inicial,
  sacada de los 30 chats: "ya le reviso", "ya reviso", "ya solicito", "ya le solicito",
  "ya te envío/envio/mando", "ya le envío", "te envío más tarde", "ya le ingreso", "ya ingreso",
  "le ingresamos", "hoy sale", "mañana sale", "mañana te confirmo", "te confirmo", "ya le paso",
  "le aviso", "le escribo", "lo reviso con", "ya le consulto", "déjeme verificar". Normaliza
  tildes y mayúsculas; prueba con los textos reales de la revisión.
- Si ya hay un 📌 encendido, no lo pisa (conserva la nota del vendedor).

### 2.5 🤫 Sin automáticos

- Interruptor del vendedor por chat. Para: el cliente prometió algo ("mañana te paso las tallas",
  "pago el lunes") o hay una queja.
- Bloquea **solo** los mensajes automáticos al cliente (reactivación, y a futuro envío a grupos).
  No bloquea alertas al vendedor ni respuestas a un cliente que acaba de escribir.

### 2.6 Etiqueta del CRM (solo lectura)

- Último pedido no cancelado del cliente, en **cualquier tienda**, cruzado por los últimos 9
  dígitos (`crm.cliente_conversacion.telefono`, `crm.clientes.celular`) o por `id_venta`.
- Chip según `estado_pedido`:
  - `EN_FABRICA` → `🏭 En fábrica`
  - `DESPACHO` → `📦 Por despachar` (supuesto: listo, todavía no sale; confirmar)
  - `COMPLETADO` → `🚚 Despachado` (**confirmado por Rodrigo 22-sep: COMPLETADO = ya se despachó**). Se muestra 7 días desde `fecha_actualizacion` y luego se oculta.
  - `ENTREGADO` → no se muestra · `CANCELADO` → se ignora (se busca el anterior).
  - Aparte, si `estado_pago = ABONO`: `💳 Saldo $X` (`monto_pendiente`), en cualquier estado.
- Se arma **en la base** (vista `inbox.pedido_por_telefono`), una lectura por ciclo, nunca chat por chat.
- ⚠️ `guia_numero` está vacío en los pedidos revisados: el número de guía no puede mostrarse hasta que despacho lo cargue (el 🚚 sí sale, del estado).
- Regla para el vendedor: **nunca decir "ya fue enviado" sin ver 🚚 Despachado.**

### 2.7 Tipo de contacto

- `cliente` (por defecto) · `🏷️ interno/proveedor` (lo marca el vendedor).
- Los internos no entran en alertas, reactivación, métricas ni señal a Meta. Siguen apareciendo
  en 🔴 cuando escriben (alguien del equipo puede necesitar respuesta), con su etiqueta.

## 3. Alertas al vendedor

| Alerta | Cuándo | Dónde |
|---|---|---|
| 🔴 Cliente esperando | >10 min sin respuesta, 08:00–21:00, insiste cada 30 min (regla existente de `lib/pendientes.js`) | **Nuevo:** contador y orden "más esperando primero" dentro del inbox, además de Telegram |
| ⏰ Ventana por cerrarse | 20 h de silencio del cliente con etapa 💬/💳 o 📌 encendido | chip ⏰ en la fila + push |
| 📌 viejo | 📌 encendido hace >12 h | chip en la fila + contador en el filtro 📌 |

## 4. Filtros

Chips combinables: bandeja × temperatura × etapa × 📌 × 🤫 × CRM × tipo. Ejemplos: `🔴 + ❄️`,
`💬 + 🌤️`, `📌`, `🛒` (lista de la noche). El filtro por número (canal) sigue siendo de MENSAJES,
no de agenda (regla de canal).

## 5. Reactivación automática (proyecto 3, depende de este)

Le escribe al cliente **solo si todo se cumple:** último mensaje nuestro · sin 📌 · sin 🤫 ·
etapa 💬 o 💳 · sin pedido en ninguna tienda · tipo cliente · ventana abierta · fuera de 22:00–08:00
(hora Ecuador; si cae de noche se posterga a las 08:00 si sigue dentro de 24 h, si no se salta).

- Toques: ~3 h, mañana siguiente (08:00–10:00) y ~20 h. Se corta si el cliente escribe; se reinicia si escribimos.
- Texto según lo que falta: cerrar ("¿te paso el total y los datos?"), pagar, revisar proforma. Se arma en el lienzo de FLUJOS como flujo de reactivación.
- Se reutiliza `lib/url-propia.js` (sin él, 401 de Vercel).

## 6. Datos (una migración)

```sql
alter table inbox.conversaciones
  add column etapa text check (etapa in ('cotizando','esperando_pago','falta_pedido','postventa')),
  add column etapa_por text check (etapa_por in ('humano','flujo')),
  add column etapa_at timestamptz,
  add column deuda_nota text,          -- 📌 encendido ⇔ deuda_at no nulo
  add column deuda_por text check (deuda_por in ('humano','auto')),
  add column deuda_at timestamptz,
  add column sin_automaticos boolean not null default false,
  add column tipo_contacto text not null default 'cliente' check (tipo_contacto in ('cliente','interno'));
-- + vista inbox.pedido_por_telefono; migración de venta_en_proceso_at → etapa falta_pedido.
```

Todo por **persona** (como la temperatura de hoy), no por canal. Agregar las columnas a
`COLS_CONTACTO` y `toContacto` (lo exige `tests/columnas-contacto.test.js`).

## 7. Orden de construcción

1. **Capas y filtros:** migración, bandeja sin Soporte/Encuesta/Venta, temperatura calculada,
   etapa, 📌 manual, 🤫, tipo de contacto, filtros, freno al 🟢. Quitar temperatura de flujos y Automatizaciones.
2. **Automático sin enviar nada:** 📌 🤖 por promesa, flujo pone etapa, borrado de etapa al crear pedido, etiqueta CRM, alertas en el inbox.
3. **Reactivación** (proyecto 3).
4. **Fase 2:** plantillas fuera de 24 h, envío a grupo filtrado (con el mismo horario y candados), guía automática.

## 8. Pruebas

- Puras con casos reales: `detectarPromesa` (frases de los 30 chats + falsos positivos), temperatura por horas, decisión de reactivación (tabla de candados), borrado de etapa al llegar pedido.
- Regla de oro: un entrante sobre un chat con etapa + 📌 + 🤫 deja todo igual salvo la bandeja.
- Verificación en vivo antes de dar por cerrada cada parte: un chat de prueba recorriendo las capas.

## 9. Decisiones descartadas

- Temperatura manual del vendedor (se confunde con la etapa y nunca baja).
- Temperatura que dispara mensajes (mandaba "¿pudiste pensarlo?" a toda la pauta).
- 🔔 "Retomar el…" con fecha: pasadas 24 h no se puede escribir sin plantilla. Lo cubren ⏰ a las 20 h y 🤫.
- Lista 🛒 obligatoria: atrasaría a quien crea el pedido al momento (7 de 16 ventas).
- Gestión de un solo valor: 5 casos necesitaban 🛒 y 📌 a la vez.
