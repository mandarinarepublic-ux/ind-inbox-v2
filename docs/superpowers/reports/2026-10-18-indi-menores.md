# Indi: arreglos menores pendientes (18-oct-2026)

Lote de 7 arreglos chicos que quedaron del entrenamiento de Indi
(ver `docs/HANDOFF-2026-10-18-indi-entrenamiento.md`). Todo en `main`, con commit y **sin push**.

## Commits

**ind-inbox-next**
- `05beaed` fix(webhook): leer los pedidos para Indi tiene su propio tope de 8 s y si se pasa va pedidos: null
- `598d944` fix(indi): en Probar se ve cuando Indi no pudo leer su base o pidió pasar el chat, y que la prueba no ve pedidos
- `a64e32b` fix(indi): los precios se ven como en Ecuador ($20, $3,50) en lo que sabe Indi y en el historial
- `64109f1` fix(indi): borrar o deshacer algo que ya no existe da 404, reponer lo que ya está da 409 y activo/orden se validan
- `9520582` fix(indi): al editar una promo vencida te avisa que le pongas fecha nueva o la borres

**indx-agent**
- `600e4ad` test(agent): pruebas de mandar_respuesta_rapida, que pasa a lib/respuestaRapida.js
- `9fc91f7` fix(turno): si una herramienta revienta, su tool_result va con is_error: true

## 1. Tope para leer los pedidos en el webhook

- **Cambio:** `lib/pedidos-indi.js` tiene ahora `conTope(promesa, ms, que)`, una función PURA (un `Promise.race` contra un reloj que se limpia al final). En `app/api/webhook/route.js`, `responderConIA` envuelve `cargarPedidosParaIndi` con `conTope(..., PEDIDOS_TOPE_MS = 8000, 'leer los pedidos')`. Si se pasa del tope cae en el mismo `catch` que una lectura fallida: `console.error('[webhook IA] no pude leer los pedidos: leer los pedidos tardó más de 8000 ms')` y se manda `pedidos: null`.
- **Pruebas** (`tests/pedidos-indi.test.js`): si tarda más del tope, rechaza con el mensaje "tardó más de"; si llega antes, devuelve su valor o su error tal cual.
- **Nota:** la consulta de fondo no se cancela (supabase-js no recibe un `AbortSignal` aquí). Sigue corriendo, pero ya no frena la respuesta.

## 2. Probar: sinBase, escalarPedido y motivo

- **Cambio:** `app/api/indi/probar/route.js` deja pasar `sinBase`, `escalarPedido`, `escalado` y `motivo`. La función pura nueva `burbujasDeRespuesta(r)` de `lib/indi-vista.js` decide qué burbujas salen, y `components/indi/Probar.jsx` la usa:
  - con `sinBase`: "⚠️ Indi no pudo leer su base: en un chat real, el chat pasaría a una persona." (y nada más);
  - con `escalarPedido` o `escalado`: el aviso que ya existía, "🙋 Aquí Indi pasaría el chat a una persona: <motivo>". Antes solo miraba `escalado`, y en `source: 'probar'` el agente nunca hace el traspaso, así que la mayoría de los casos no se veían;
  - sin texto, sin fotos y sin traspaso: el error de siempre, "no contestó nada".
  - Nota fija debajo de la ayuda: "La prueba no ve pedidos de clientes reales."
- **Pruebas** (`tests/indi-vista.test.js`): respuesta normal; sinBase; escalarPedido con motivo; escalado sin motivo ("sin motivo"); respuesta vacía o `null`.

## 3. Precios en formato de Ecuador

- **Cambio:** `dinero(p)` en `lib/indi-vista.js` da `$20`, `$3,50` y `$0,99`. Redondea a centavos (`19.999` da `$20`). Un valor vacío o `null` da `''`, y lo que no es número sale tal cual. Se usa en `components/indi/Conocimiento.jsx`, donde reemplaza a `precioTexto` (que mostraba `$20.00`), y en `components/indi/Historial.jsx`, en el detalle de la columna `precio`. Ningún otro componente de 🧠 INDI muestra plata.
- **Pruebas:** enteros, `'20.00'`, decimales, 0, redondeo, vacío y texto.
- **Nota:** no pone separador de miles (`$1200`). Los precios de IND no llegan a esas cifras.

## 4. API: 404, 409 y validación de activo/orden

- **(a) 0 filas da 404:** la función pura nueva `resultadoEscritura({data, error}, noHay)` de `lib/indi-validar.js` convierte el resultado de una escritura con `.select(...)` en `{status, body}`:
  - 23505 da 409;
  - cualquier otro error da 500 con su mensaje;
  - 0 filas da 404 con `noHay`;
  - en otro caso, 200 `{ok:true}`.
  Se usa en:
  - `feriados` borrar (`.select('fecha')`): "Ese feriado ya no existe (quizá alguien lo borró antes)";
  - `conocimiento` borrar: tanto la firma previa como el delete usan `.select('id')`; si la firma no toca nada, sale 404 sin borrar. Mensaje: "Eso ya no existe (quizá alguien lo borró antes)";
  - `historial` deshacer: restaurar (update), borrar (firma + delete) y reinsertar (insert) usan `.select(col)`. Mensaje: "La fila de ese cambio ya no existe: no hay nada que deshacer".
- **(b) 409:** reinsertar algo que ya existe (23505) da "Ese registro ya existe: no hay nada que reponer".
- **(c) Validación:** `validarFila` revisa `activo` y `orden`.
  - `activo` acepta booleano o `'true'`/`'false'`; si no viene, no se toca. Cualquier otra cosa da 400 "El campo "Indi la usa" debe ser sí o no".
  - `orden` acepta un entero ≥ 0 o texto con un número; `''`/`null` cuentan como 0 y si no viene no se toca. `-1`, `2.5`, `'abc'` o `true` dan 400 "El orden debe ser un número entero mayor o igual a 0".
  - `campoDelError` manda ese mensaje junto al campo ORDEN, y el formulario lo muestra ahí.
  - El formulario manda `orden` tal cual. Antes hacía `Number(x)||0`, que se tragaba la basura sin avisar.
- **Pruebas** (`tests/indi-validar.test.js`, `tests/indi-vista.test.js`): activo (válidos e inválidos), orden (válidos e inválidos), los 4 casos de `resultadoEscritura` y `campoDelError('…orden…')`.
- **Nota:** las rutas no tienen pruebas propias (llaman a Supabase). Lo probado es la regla pura que usan. No se probó contra la base real.

## 5. Aviso de promo vencida en el formulario

- **Cambio:** `pistaPromoVencida(f, hoy)` en `lib/indi-vista.js`. En `Conocimiento.jsx`, debajo de la fecha "VALE HASTA" sale en ámbar "⌛ Esta promo ya venció: ponle una fecha nueva o bórrala." si la promo tiene una fecha anterior a hoy (hoy en Ecuador, `hoyEcuador`). Se apaga sola en cuanto la fecha es de hoy o posterior. Si hay un error del servidor en ese mismo campo, se muestra el error en vez del aviso.
- **Pruebas:** vencida, vence hoy, sin fecha, no promo.

## 6. indx-agent: pruebas de mandar_respuesta_rapida

- **Cambio mínimo:** lo que hacía la herramienta pasó tal cual a `lib/respuestaRapida.js` (`mandarRespuestaRapida(toolInput, ctx)`), y `api/agent.js` la llama desde `executeTool`. No se importó `api/agent.js` en las pruebas porque crea el cliente de Anthropic y la hoja al cargarse. Un id vacío ahora da `ok:false` de una.
- **Pruebas** (`tests/respuestaRapida.test.js`):
  - id desconocido o sin id: `ok:false` y no agrega fotos;
  - id con fotos: salen en orden, sin casillas vacías ni `null`, y una segunda llamada en el mismo turno se suma detrás;
  - `"[12]"`, `" 12 "`, `12` y `"[ 12 ]"` dan el mismo id;
  - sin respuestas en la base: `ok:false`.

## 7. indx-agent: is_error en tool_result

- **Cambio:** en `lib/turno.js`, cuando `ejecutar` lanza un error, el `tool_result` lleva `is_error: true` (campo de la API de Anthropic). Cuando la herramienta sale bien, el campo no va.
- **Prueba** (`tests/turno.test.js`): turno con una herramienta que revienta y otra que sale bien; la primera lleva `is_error: true` y la segunda no tiene el campo.

## Comandos y salida

```
# ind-inbox-next
$ npm test
ℹ tests 895
ℹ pass 895
ℹ fail 0
✖ 1 problem (0 errors, 1 warning)   ← components/RightPanel.jsx:168 (rules-of-hooks); ya estaba, no es de este lote
exit 0

$ npm run build
├ ƒ /api/webhook ...
○ (Static) / ƒ (Dynamic) ...
exit 0   (compila)

# indx-agent
$ npm test
ℹ tests 46
ℹ pass 46
ℹ fail 0
exit 0
$ node --check api/agent.js   → OK
```

En ind-inbox-next, el hook de commit corre `npm test` (pruebas + lint) en cada commit, y salió en verde en los 5.

## Pendiente o a tener en cuenta

- Nada de esto se probó en vivo: ni contra Supabase (404/409) ni en el navegador (Probar, precios, aviso de promo). Probarlo en un preview antes de dar por cerrado.
- `docs/HANDOFF-2026-10-18-indi-entrenamiento.md` estaba modificado en el árbol de trabajo por otra mano. No se tocó ni se incluyó en estos commits.
