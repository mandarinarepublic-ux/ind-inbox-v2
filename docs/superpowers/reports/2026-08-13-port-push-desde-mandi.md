# Port del push de avisos — MANDI a IND (2026-08-13)

## Qué se portó

Los dos defectos del push (medidos en producción, MANDI e IND comparten el mismo bug porque nacen del mismo código base de julio):

1. El botón de suscripción solo reportaba el resultado por `title=` (tooltip de hover), invisible en celular.
2. El enfriamiento de 5 minutos por conversación (`ENFRIAMIENTO_MS` / `debeNotificar`) era una **guarda de envío**: si ya se había avisado una vez, un mensaje nuevo dentro de la ventana simplemente NO generaba push. Un cliente que escribía una vez y esperaba se quedaba sin avisos para siempre.

El arreglo: el aviso se manda SIEMPRE; la ventana (ahora `VENTANA_SONIDO_MS`, 60 s) solo decide `renotify` (si suena o se actualiza callado), igual que WhatsApp.

### Archivos portados

- **`lib/push.js`** — copiado del de MANDI casi íntegro. Cambios respecto al original de IND:
  - `ENFRIAMIENTO_MS` (5 min) → `VENTANA_SONIDO_MS` (60 s).
  - `debeNotificar` (guarda de envío) → `debeSonar` (solo decide sonido).
  - Se agregó `avisoDeEntrante(...)`, que arma el objeto completo del aviso (título, cuerpo, url, tag, tel, renotify) y **siempre** devuelve algo — nunca null.
  - `enviarPush` ahora acepta `renotify` en el payload (`renotify: renotify !== false`).
  - Se conservó el comentario propio de IND sobre el par de claves VAPID independiente (no estaba en MANDI, es específico de IND y sigue siendo cierto).

- **`public/sw.js`** — `renotify: true` (fijo) → `renotify: d.renotify !== false` (depende del payload). Comentario del listener `push` actualizado para que coincida con MANDI.

- **`app/api/webhook/route.js`** — la función `avisarSiCorresponde` (existe con el mismo nombre en IND) perdió su `if (!debeNotificar(...)) return` y ahora arma el aviso con `avisoDeEntrante(m, ultimoPushAtDe(m.telefono), Date.now())` y lo manda incondicionalmente. El import cambió de `{ enviarPush, cuerpoDeMensaje, debeNotificar }` a `{ enviarPush, avisoDeEntrante }`.

- **`components/PushToggle.jsx`** — reemplazado por la versión de MANDI: sin `window.prompt`, con mensajes visibles en pantalla (banda inferior fija, se autocierra a los 8 s o al tocarla), objetivo táctil de 44px en punteros gruesos, `aria-label` en vez de `title`. `<PushToggle />` no recibe props en ningún lado (`components/App.jsx`), así que no hizo falta tocar el sitio de uso.

- **`app/api/push/subscribe/route.js`** — se quitó la verificación de `PUSH_CLAVE`. El comentario nuevo explica por qué: IND ya tiene login real (`middleware.js`, `AUTH_MODO=bloquear`) que deja la ruta detrás del candado, verificado hoy: `POST /api/push/subscribe` sin sesión da 401 y `/inbox` redirige (307) al login del CRM. La clave por query/body era además peor que inútil: su error solo se veía en un `title=`.

- **`tests/push.test.js`** — portado con la reja estructural (ver abajo). Los tests de `lib/push.js` (recortar, cuerpoDeMensaje, debeSonar, avisoDeEntrante) son un calco directo del de MANDI; solo cambia el texto de ejemplo ("buzo" viene de MANDI en el archivo original — se mantuvo tal cual venía de la fuente, sin relevancia funcional).

## Dónde el código de IND obligó a adaptar

**IND no tiene una función `procesar()` separada como MANDI.** MANDI hace `waitUntil(procesar(nuevos, origin))` — procesa el lote en segundo plano tras devolver el 200 a Meta. IND procesa el lote de mensajes **sincrónicamente dentro de `POST`**, adentro de `if (nuevos.length) { ... }`, y recién después de ese bloque devuelve el 200. Esto es una diferencia arquitectónica preexistente de IND, no algo que esta tarea debía tocar — no se modificó.

Consecuencia directa: `avisarSiCorresponde` en IND queda anidada tres niveles adentro de `POST` (función → `if (nuevos.length)`), a **6 espacios de indentación**, no a 2 como en MANDI (donde es un closure directo de `procesar`). Portar la reja estructural con el anclaje literal `'\n  }'` (2 espacios) de MANDI habría sido incorrecto: en IND ese patrón de 2 espacios no aparece cerca de la función (aparece muy después, en otro cierre de bloque), así que el `hasta` habría quedado mal delimitado o habría tomado un fragmento gigante del archivo.

**Adaptación aplicada:** en vez de un número de espacios fijo, el test ahora calcula la sangría real de la línea `async function avisarSiCorresponde` (`src.lastIndexOf('\n', desde) + 1` hasta `desde`) y busca el cierre de función como `'\n' + sangria + '}'`. Esto hace que la reja funcione con la indentación real de cada repo sin tener que hardcodear la profundidad de anidación. Se documentó explícitamente en el comentario del test por qué existe esa diferencia con MANDI.

Todo lo demás de la reja (un solo `return`, un solo `if`, nada entre `add` y `enviarPush`, la línea de envío empieza con `await enviarPush(`, la llamada externa empieza con `await avisarSiCorresponde(m)`) se portó sin cambios: sigue aplicando igual sobre el cuerpo delimitado dinámicamente.

## Prueba RED/GREEN de la reja estructural

Comando usado en las tres corridas: `node --test tests/push.test.js` (desde `C:\Users\RodrigoWork\Desktop\ind-inbox-next`).

### GREEN inicial (código portado, sin guardas)

```
✔ el webhook manda el aviso SIN condicion (reja estructural) (0.9362ms)
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

### RED variante 1 — guardar el envío ENTRE el `add` y `enviarPush`

Edición temporal en `app/api/webhook/route.js`:

```js
async function avisarSiCorresponde(m) {
  const t = tail9(m.telefono)
  if (avisados.has(t)) return
  avisados.add(t)
  if (!debeSonar(ultimoPushAtDe(m.telefono), Date.now())) return   // <- guarda insertada
  await enviarPush(avisoDeEntrante(m, ultimoPushAtDe(m.telefono), Date.now()))
  await marcarPush(m.telefono)
}
```

Resultado:
```
✖ el webhook manda el aviso SIN condicion (reja estructural) (4.9224ms)
  AssertionError: avisarSiCorresponde tiene 2 returns; solo puede tener el de avisados
ℹ tests 20
ℹ pass 19
ℹ fail 1
```
RED confirmado. Se revirtió la edición y se re-corrió el archivo completo: 20/20 GREEN otra vez antes de seguir.

### RED variante 2 — condicionar la LLAMADA (fuera de la función)

Edición temporal en el sitio de la llamada:

```js
// antes: await avisarSiCorresponde(m)
if (m.tipo === 'texto') await avisarSiCorresponde(m)
  .catch(e => console.error('[/api/webhook] aviso push:', e.message))
```

Resultado:
```
✖ el webhook manda el aviso SIN condicion (reja estructural) (1.6178ms)
  AssertionError: la llamada tiene que ser incondicional, y salio: if (m.tipo === 'texto') await avisarSiCorresponde(m)
  actual: "if (m.tipo === 'texto') await avisarSiCorresponde(m)"
  expected: /^await avisarSiCorresponde\(m\)/
ℹ pass 19
ℹ fail 1
```
RED confirmado. Se revirtió y se re-corrió: 20/20 GREEN.

### RED variante 3 (verificación extra, no exigida explícitamente pero mencionada en los comentarios de la reja) — envolver TODO el cuerpo en un `if` puesto ANTES del `add`

Edición temporal:

```js
async function avisarSiCorresponde(m) {
  const t = tail9(m.telefono)
  if (debeSonar(ultimoPushAtDe(m.telefono), Date.now())) {
    if (avisados.has(t)) return
    avisados.add(t)
    await enviarPush(avisoDeEntrante(m, ultimoPushAtDe(m.telefono), Date.now()))
    await marcarPush(m.telefono)
  }
}
```

Resultado:
```
✖ el webhook manda el aviso SIN condicion (reja estructural) (1.3989ms)
  AssertionError: avisarSiCorresponde tiene 2 ifs; solo puede tener el de avisados
ℹ pass 19
ℹ fail 1
```
RED confirmado — esta es justamente la variante que las dos primeras aserciones (un solo `return`, nada entre `add` y `enviarPush`) NO detectan por sí solas, y que el conteo de `if`s sí atrapa. Se revirtió.

Tras cada revert se confirmó GREEN (20/20) antes de pasar a la siguiente variante. Al terminar las tres pruebas se dejó el archivo en su estado final portado y se confirmó con `git diff app/api/webhook/route.js` que el diff contiene únicamente el cambio permanente (import + cuerpo de `avisarSiCorresponde` sin la guarda), sin restos de ninguna de las tres ediciones temporales.

## Conteo de tests

- **Antes del port:** 168 tests, 0 fallas (confirmado con `npm test` antes de tocar nada).
- **Después del port:** 173 tests, 0 fallas (`npm test` completo).
- Diferencia: +5 tests netos en `tests/push.test.js` (el archivo de MANDI tiene más casos que el de IND: los de `avisoDeEntrante` y la reja estructural reescrita).

## Archivos cambiados

- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\push.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\public\sw.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\app\api\webhook\route.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\components\PushToggle.jsx`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\app\api\push\subscribe\route.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\push.test.js`

## Diferencias IND vs MANDI que vale la pena recordar

- **IND procesa el lote de mensajes de forma SÍNCRONA dentro de `POST`**, no en background con `waitUntil(procesar(...))` como MANDI. Esto es preexistente y NO se tocó — pero es la razón de la sangría distinta que obligó a adaptar la reja. Si algún día IND se refactoriza para separar un `procesar()` como MANDI, la reja seguirá funcionando igual (calcula la sangría dinámicamente) pero vale la pena anotarlo por si alguien busca "por qué el webhook de IND no usa waitUntil para los mensajes".
- El `tail9` de IND (`.replace(/\D/g, '').slice(-9)`) es más simple que el de MANDI (que además quita el prefijo `593` y ceros a la izquierda antes de cortar). Para números de 9-12 dígitos normales el resultado final es idéntico porque `.slice(-9)` ya descarta cualquier prefijo por delante — no se tocó, no hacía falta, y no afecta al `t9` que arma `avisoDeEntrante` en `lib/push.js` (que trae su propia lógica, calcada de MANDI, autocontenida).
- El comentario viejo de `middleware.js` sobre "sale en observar y no puede bloquear a nadie todavía" está desactualizado (login real ya bloquea) — fuera de alcance de esta tarea, no se tocó, como pidió la consigna.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y el resto de variables VAPID de IND son propias — no se tocaron, y `enviarPush` sigue filtrando por `cuenta` (columna compartida `inbox.push_subs`).

## Concerns

- No se corrió una prueba end-to-end real de push en un dispositivo (a diferencia de MANDI, que sí se verificó con un Android real). El port en sí es texto-por-texto equivalente al de MANDI y pasa la suite completa, pero la confirmación "un push real sonó" queda pendiente de que alguien lo pruebe en producción con IND.
- No se tocó `middleware.js` pese al comentario desactualizado que menciona la tarea — se dejó explícitamente fuera de alcance, tal como se indicó.
- No hubo necesidad de preguntar nada a mitad de camino: la única ambigüedad real (indentación distinta de `avisarSiCorresponde`) se resolvió con una adaptación honesta de los anclajes (sangría calculada dinámicamente), no con un test que matchee de forma vacía.
