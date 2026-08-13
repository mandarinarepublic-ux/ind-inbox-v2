# Port: recordatorio de pendientes por Telegram (MANDI → IND)

Fecha: 2026-08-13
Origen: `C:\Users\RodrigoWork\Desktop\wa-inbox-next` (solo lectura, no se tocó)
Destino: `C:\Users\RodrigoWork\Desktop\ind-inbox-next` (rama `main`, commit `b9c5edf`
+ cierre de revisión abajo)

## Qué se portó

Cron que avisa por Telegram cuando hay chats en Pendientes sin contestar. No
manda un evento (eso ya lo hace el push): insiste cada 30 min hasta que la
bandeja de Pendientes quede vacía.

Archivos nuevos:
- `lib/telegram.js` — envío a Telegram (o no-op silencioso sin credenciales).
  Puerto **verbatim** de MANDI: no tiene diferencias por tienda.
- `lib/pendientes.js` — reglas puras (horario, espera mínima, techo,
  anti-repetición, redacción del texto). Puerto de MANDI con las dos
  diferencias pedidas + la función nueva `partirPorAntiguedad`.
- `app/api/cron/pendientes/route.js` — orquestación: lee contactos, decide a
  quién avisar, manda el Telegram, estampa la marca.
- `tests/telegram.test.js`, `tests/pendientes.test.js`.

Archivos modificados:
- `lib/rutas-publicas.js` — sumada `/api/cron/pendientes` a la lista de rutas
  públicas (ahora 3, no 2).
- `middleware.js` — sumada `api/cron/pendientes` al matcher que excluye del
  candado de sesión.
- `vercel.json` — sumado el cron `*/5 * * * *` sin tocar el de seguimientos.
- `lib/contactos.js` — sumado el wrapper `marcarAvisoTelegram(telefono, ts)`.
- `lib/inbox-supabase.js` — sumados `ultimoAvisoTelegramAt` al mapeo de
  `toContacto()` y la función `marcarAvisoTelegramSupabase()`.
- `tests/rutas-publicas.test.js` — la copia paralela de la lista de rutas
  públicas, actualizada a 3 (con su prueba de "son EXACTAMENTE tres").

## Cada lugar donde IND forzó una adaptación

1. **`ESPERA_MAXIMA_MS` — 2 horas, no 24.** Pedido explícito. Comentario en
   `lib/pendientes.js` con los números medidos: 285 pendientes en producción,
   81 entrarían con techo de 24h (el de MANDI), 24 con el de 2h. IND recibe
   ~40 clientes nuevos por día y contesta pocos: un número grande es cierto
   pero inútil, 2h es la ventana donde una respuesta rápida todavía cierra la
   venta.

2. **`BASE_URL` — dominio de IND.** Verificado contra
   `ind-inbox-next/next.config.js` (no de memoria): el redirect del host viejo
   ahí apunta a `https://ind-inbox.apps.mandarinaec.com`, que es el dominio
   real de IND en `*.apps.mandarinaec.com`. Se usó ese valor como default,
   con el mismo override `INBOX_URL` que tiene MANDI.

3. **`autorizado()` — copiado de la versión ENDURECIDA de MANDI, no de la
   propia `app/api/cron/seguimientos/route.js` de IND.** Ese archivo viejo
   acepta `x-vercel-cron` SIEMPRE que esté presente, tenga o no `CRON_SECRET`
   — la forma permisiva. La nueva ruta usa la regla de MANDI: con
   `CRON_SECRET` configurado, manda el secreto (el header solo no alcanza);
   sin secreto, el header es lo único que hay y ahí sí vale. IND hoy no
   tiene `CRON_SECRET`, así que arranca en la rama "sin secreto" — segura
   igual porque solo Vercel manda ese header, y lista para endurecerse el
   día que se cree la variable, sin tocar código. **No se modificó el archivo
   viejo** `app/api/cron/seguimientos/route.js`, tal como se pidió.

4. **Comentario de `getContactos(null)`** — adaptado a los dos números reales
   de IND (3326 principal / 9804 secundario, `lib/canales.js`) en vez de la
   referencia a REPUBLIC de MANDI.

5. **`marcarAvisoTelegram` no existía en la capa de datos de IND** — se sumó
   el wrapper en `lib/contactos.js`, la función en `lib/inbox-supabase.js`
   (`marcarAvisoTelegramSupabase`, sobre `setCampoContacto` ya existente) y el
   campo `ultimoAvisoTelegramAt` al mapeo `toContacto()`. La columna
   `ultimo_aviso_telegram_at` ya existe en `inbox.conversaciones` (tabla
   compartida con MANDI, separada por `cuenta`) — **no se corrió ninguna
   migración**, como se indicó.

## Comportamiento nuevo que MANDI todavía no tiene: `partirPorAntiguedad`

Dos revisores de MANDI señalaron el mismo defecto: un chat que cruza el techo
se vuelve invisible para Telegram — ni se notifica (correcto) ni se menciona
(incorrecto). Un Telegram callado se lee como "bandeja limpia" cuando no lo
está. Pesa mucho más en IND: 24 chats dentro del techo contra 285 pendientes
totales.

Se agregó `partirPorAntiguedad(contactos, ahoraMs) => { recientes, arrastre }`
a `lib/pendientes.js`, y `textoAviso` ganó un 4º parámetro opcional
(`arrastre = 0`) que agrega una línea aparte cuando es mayor que cero:

```
(+207 de más de 2 h)
```

(se usa `esperaLegible(ESPERA_MAXIMA_MS)` para el texto — con techo de 2h da
"2 h"; si algún día MANDI reutiliza esto con su techo de 24h, la frase se
ajusta sola porque no está hardcodeada como "un día").

El route usa `partirPorAntiguedad` y pasa `arrastre.length` a `textoAviso`. El
arrastre se calcula SIEMPRE (aunque no haya nada que notificar) y viaja
también en el JSON de respuesta (`arrastre: N`) para que quede visible en los
registros — pero **nunca se estampa ni se cuenta como notificado**: el loop de
`marcarAvisoTelegram` solo recorre `aAvisar`, jamás `arrastre`. Estampar el
arrastre lo silenciaría para siempre (entraría en el enfriamiento de 30 min de
un aviso que nunca se mandó).

### Corrección a mitad de camino (importante)

El coordinador mandó una corrección urgente durante la implementación: la
especificación original no decía que `partirPorAntiguedad` debía filtrar por
`estado === 'pendiente'`. Sin ese filtro, el arrastre se llena de chats
ATENDIDO/VENTA/ARCHIVADO viejos — medido en producción, el mensaje diría
"(+2.460 de más de un día)" en vez de "(+207 ...)" (92% del número serían
conversaciones ya resueltas), y contradice la garantía del dueño ("si
Pendientes está vacío, contesté a todos").

**Ya lo había implementado así por mi cuenta** — filtrando por
`estado === 'pendiente'` igual que `chatsQueAvisar` — antes de que llegara el
aviso, así que no hizo falta cambiar código. Sí faltaba el test explícito que
lo prueba, que se agregó:

- `'el arrastre NO cuenta chats que ya no estan pendientes'` — 4 chats viejos
  (atendido/venta/archivado/pendiente), solo el pendiente entra en arrastre.
- `'recientes tampoco cuenta un atendido reciente'` — mismo chequeo del lado
  de `recientes`.

El comentario en `lib/pendientes.js` documenta el porqué con los números
medidos (2.460 vs 207), no solo "filtra por pendiente", para que quien lo lea
después entienda qué revive si lo saca.

## TDD: evidencia RED → GREEN para `partirPorAntiguedad`

**RED** — se escribió `tests/pendientes.test.js` completo (incluidas las
pruebas de `partirPorAntiguedad`) contra un `lib/pendientes.js` que todavía no
existía:

```
$ cd ind-inbox-next && node --test tests/pendientes.test.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\pendientes.js'
imported from tests\pendientes.test.js
...
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

**GREEN** — tras implementar `lib/pendientes.js` (con el filtro por
`estado === 'pendiente'` ya incluido):

```
$ node --test tests/pendientes.test.js tests/telegram.test.js
✔ partirPorAntiguedad separa los recientes (dentro del techo) del arrastre (mas alla)
✔ un chat que no llega al minimo no cae en ninguno de los dos baldes
✔ el borde del techo en partirPorAntiguedad: exactamente 2h es reciente, un pelo mas es arrastre
✔ el arrastre NO cuenta chats que ya no estan pendientes
✔ recientes tampoco cuenta un atendido reciente
✔ con arrastre, el mensaje nombra cuantos chats de mas quedaron afuera
✔ sin arrastre, no aparece ningun parentesis de mas
✔ llamar textoAviso con 3 argumentos es identico a pasar 0 explicito
...
ℹ tests 41
ℹ pass 41
ℹ fail 0
```

Cobertura específica pedida:
- **La partición** — `'partirPorAntiguedad separa los recientes ... del arrastre ...'`
- **Un chat bajo el mínimo no cae en ningún balde** — `'un chat que no llega al minimo no cae en ninguno de los dos baldes'`
- **El número aparece con arrastre** — `'con arrastre, el mensaje nombra cuantos chats de mas quedaron afuera'`
- **Sin arrastre, cero paréntesis de más** — `'sin arrastre, no aparece ningun parentesis de mas'`
- **3 argumentos ≡ pasar 0** — `'llamar textoAviso con 3 argumentos es identico a pasar 0 explicito'`
- (extra, tras la corrección) el filtro por estado en ambos baldes.

## Dominio usado y verificación

`https://ind-inbox.apps.mandarinaec.com`, leído directamente de
`ind-inbox-next/next.config.js` (línea del redirect del host viejo), no
asumido ni copiado de MANDI. Confirmado también que en `lib/rutas-publicas.js`
y `middleware.js` de IND no existen `api/social/webhook` ni `api/pago-dlocal`
(no se copiaron de MANDI por error).

## Conteo de pruebas

| | antes | después |
|---|---|---|
| total | 173 | **215** |
| pass  | 173 | **215** |
| fail  | 0   | **0** |

Desglose del delta (+42): 41 nuevas (`tests/pendientes.test.js` +
`tests/telegram.test.js`) + 1 nueva en `tests/rutas-publicas.test.js` (un
`test()` más por cada entrada nueva en `PUBLICAS`, que pasó de 2 a 3 rutas).
Ningún test preexistente cambió de resultado.

```
$ node --test "tests/**/*.test.js"
ℹ tests 215
ℹ pass 215
ℹ fail 0
```

## Archivos tocados (rutas absolutas)

Nuevos:
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\telegram.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\pendientes.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\app\api\cron\pendientes\route.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\telegram.test.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\pendientes.test.js`

Modificados:
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\rutas-publicas.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\middleware.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\vercel.json`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\contactos.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\lib\inbox-supabase.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\rutas-publicas.test.js`

## Autorrevisión (checklist del encargo)

- [x] Techo de 2h y dominio de IND, cada uno con comentario explicando por qué
      difiere de MANDI, con números medidos.
- [x] El estampado (`marcarAvisoTelegram`) ocurre solo tras un envío exitoso
      (`if (!r.ok) return ...` antes del loop) y está `await`eado dentro del
      `for`.
- [x] La rama "Telegram sin configurar" (`sin-config`, con `console.log`) es
      distinguible en los registros de "el cron nunca corrió" (401,
      `console.error` con el detalle de si había `x-vercel-cron` y si había
      `CRON_SECRET`).
- [x] Comentarios explican el *porqué*, con la densidad de los dos repos
      (números medidos, casos reales, qué se rompe si alguien saca algo).

## Estado del repo

Commit `b9c5edf` en `main` con los 11 archivos del port (sin push). El cierre
de revisión de abajo va en un segundo commit, también sin push.

## Preocupaciones / cosas a revisar

1. **`tests/rutas-publicas.test.js` ya tenía un conteo desincronizado con el
   repo real, previo a este cambio.** El `find app/api -name route.js` real
   devuelve 30 rutas (incluyendo `/api/admin/meta-waba`, que no está en
   `PROTEGIDAS`); antes de este port ya eran 29 reales contra 28 declaradas.
   Este port sumó la ruta 30 (`/api/cron/pendientes`) y actualizó el conteo
   declarado a 29 (3 públicas + 26 protegidas), manteniendo la misma
   proporción que tenía el archivo antes de tocarlo — pero la ruta
   `/api/admin/meta-waba` sigue sin estar en ninguna de las dos listas. Es un
   gap preexistente, no introducido por este trabajo, y lo dejo señalado en
   vez de "arreglarlo" de paso para no mezclar un cambio no pedido con este
   port.
2. **El texto del arrastre usa "2 h" (el techo real de IND), no "un día"**
   como decía el ejemplo ilustrativo del encargo original
   (`(+206 de más de un día)`). Con techo de 2h, decir "más de un día" sería
   falso para la mayoría del arrastre (chats de 3-20h también entran ahí).
   Se generalizó a `esperaLegible(ESPERA_MAXIMA_MS)` para que el texto sea
   siempre cierto y, de paso, quede correcto solo si algún día MANDI
   reutiliza esta función con su propio techo de 24h.
3. No se probó el cron contra Vercel real ni contra Supabase real (fuera de
   alcance: "no llamar ninguna URL de producción"). La verificación es
   estática (lectura de código + `node --check` + suite de tests) y por
   coherencia de tipos/firmas con el resto de `lib/contactos.js` /
   `lib/inbox-supabase.js`.

## Cierre de revisión (13-ago-2026, segunda pasada)

La revisión de "Ready to deploy" pidió un Important y dos minors sobre el
estado de IND en general (no todos nacieron de este port). Se resolvieron los
tres antes de desplegar.

### 1 (Important) — el aviso push bloqueaba el 200 a Meta

`app/api/webhook/route.js:320` hacía `await avisarSiCorresponde(m)` en el
camino SÍNCRONO del webhook. Con el push reescrito a "avisa siempre" (puerto
anterior, `docs/superpowers/reports/2026-08-13-port-push-desde-mandi.md`), ese
costo —una consulta a `push_subs` + un POST HTTPS por aparato suscrito— pasó de
pagarse una vez cada 5 min (enfriamiento viejo) a pagarse en CADA mensaje de
CADA ráfaga, todo antes de que Meta reciba su 200. IND ya está medido como el
lado LENTO para recibir de los dos inbox justamente por tener el webhook
síncrono: frenar más el 200 es empeorar a propósito un problema ya conocido
(las respuestas lentas son lo que dispara reentregas de Meta).

Arreglo: se envolvió la llamada en `waitUntil`, igual que ya hacía
`saludarSiCorresponde` dos líneas más abajo en el mismo archivo:

```js
// antes
await avisarSiCorresponde(m)
  .catch(e => console.error('[/api/webhook] aviso push:', e.message))

// despues
waitUntil(avisarSiCorresponde(m).catch(e => console.error('[/api/webhook] aviso push:', e.message)))
```

La reja estructural de `tests/push.test.js` afirma la FORMA exacta de la
llamada (no solo que exista): su última aserción esperaba
`/^await avisarSiCorresponde\(m\)/`. Se actualizó a
`/^waitUntil\(avisarSiCorresponde\(m\)/` — acepta el envoltorio en background,
sigue rechazando cualquier `if` puesto ANTES de la llamada.

**Evidencia RED → GREEN de la reja actualizada** (no del código de producción,
que ya estaba en GREEN — la reja es lo que se puso a prueba):

```
$ node --test tests/push.test.js        # con waitUntil, sin guarda
✔ el webhook manda el aviso SIN condicion (reja estructural)
ℹ tests 20 / pass 20 / fail 0
```

Se metió a mano un `if` de prueba delante de la llamada (
`if (debeSonar(m)) waitUntil(avisarSiCorresponde(m)...)`), se corrió de nuevo:

```
$ node --test tests/push.test.js        # con guarda de prueba, RED esperado
✖ el webhook manda el aviso SIN condicion (reja estructural)
  AssertionError: la llamada tiene que ser incondicional (en background), y salio:
  if (debeSonar(m)) waitUntil(avisarSiCorresponde(m).catch(...))
  expected: /^waitUntil\(avisarSiCorresponde\(m\)/
```

Se quitó el `if` de prueba y se confirmó GREEN otra vez (20/20). La reja sigue
cazando la guarda condicional después del cambio.

### 2 (Minor) — el comentario del middleware contradecía el modo real

`middleware.js:22-25` decía `☠️ ESTE INBOX SALE EN 'observar' Y NO PUEDE
BLOQUEAR A NADIE TODAVÍA`. Verificado contra
`docs/HANDOFF-2026-08-08-fase5-ind.md:16` (no copiada la fecha de la
instrucción del coordinador, leída del handoff): `AUTH_MODO=bloquear` está en
producción desde el **8-ago-2026** (Fase 5), con API sin cookie → 401 y
páginas → login del CRM, verificado en vivo ese día por Rodrigo y Xavier
(cero mensajes fallidos, cero 401 de usuario real). El comentario se
reescribió para reflejar ese estado real y fechar el cambio, en vez de seguir
describiendo un modo que ya no rige.

### 3 (Minor) — off-by-one en el inventario de rutas

`tests/rutas-publicas.test.js` declaraba 29 rutas; conteo propio (no el 30 que
pasó el coordinador, verificado con `find app/api -name route.js | wc -l` +
listado uno por uno) dio efectivamente **30**. Faltaba `/api/admin/meta-waba`
en `PROTEGIDAS` — sin exposición real (el matcher de `middleware.js` ya la
cubre por defecto), pero el archivo cuyo único trabajo es ser un inventario
confiable tenía un hueco. Se agregó a `PROTEGIDAS` (ahora 27, antes 26) y se
corrigió el total declarado a 30 (3 públicas + 27 protegidas). Sumó un test
nuevo (`PROTEGIDA: /api/admin/meta-waba`).

### Lo que no se tocó (por instrucción explícita)

- El `matchMedia` con desajuste de hidratación heredado de MANDI: se deja vivo
  en los dos repos a propósito, para no desincronizarlos.
- `app/api/cron/seguimientos/route.js`: sigue con la autorización permisiva
  (acepta `x-vercel-cron` siempre que esté presente). Decisión aparte del
  dueño, no de este port.
- El comentario de `avisoDeEntrante` en `lib/push.js` que dice que el `tag`
  "replica la lógica de `tail9` del webhook": es impreciso (el `tail9` de IND
  es más simple, sin quitar el prefijo `593`), pero **no lo escribí en este
  port** — vino del port anterior del push
  (`docs/superpowers/reports/2026-08-13-port-push-desde-mandi.md`, que ya lo
  señala en su propia sección de preocupaciones, línea ~145). Se deja tal
  cual, como pidió el coordinador para comentarios que no son de este trabajo.

### Pruebas tras el cierre

```
$ npm test
ℹ tests 216
ℹ pass 216
ℹ fail 0
```

216 = 215 del port original + 1 (`PROTEGIDA: /api/admin/meta-waba`, nueva por
el punto 3). Ningún test preexistente cambió de resultado; el único test que
pasó por RED en este cierre fue la reja de `push.test.js`, y fue a propósito
(sabotaje manual, revertido).

### Archivos tocados en este cierre

- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\app\api\webhook\route.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\middleware.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\push.test.js`
- `C:\Users\RodrigoWork\Desktop\ind-inbox-next\tests\rutas-publicas.test.js`
