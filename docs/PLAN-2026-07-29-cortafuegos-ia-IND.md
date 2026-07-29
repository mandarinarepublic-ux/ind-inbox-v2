# PLAN — Cortafuegos de la IA en IND, un interruptor por número

Proyecto Vercel **`ind-inbox-v2`** (la carpeta se llama `ind-inbox-next`: no son dos cosas).
Producción = `main`. Fecha: 2026-07-29. **Nada se despliega hasta que este plan esté aprobado.**

---

## 1. Por qué

Desde el **1-ago-2026** Meta empieza a cobrar su IA. La decisión es apagar la de Meta
y trabajar solo con el bot propio (**`indx-agent`**), pero poder pararlo de golpe.

MANDI ya tiene ese cortafuegos (desplegado hoy). Esto lo lleva a IND.

## 2. Lo que encontré al analizar IND — léelo antes que el diseño

IND **no es** una copia de MANDI. Cuatro diferencias, y una de ellas es grave.

### 2.1 IND ya tiene un apagado global, pero es una variable de entorno

`app/api/webhook/route.js:31`:

```js
const IA_ON = String(process.env.IA_AUTORESPUESTA || '')… === 'on'
```

Existe el apagado, pero cambiarlo **exige un redespliegue**: no sirve como botón de
pánico, y no distingue entre los dos números.

### 2.2 🔴 El bot está ACTIVO y hoy no hay forma de pararlo sin redesplegar

- **385 llamadas a `indx-agent/api/agent` en las últimas 24 h.** El bot está
  contestando clientes ahora mismo.
- **876 de 1.242 conversaciones** tienen `modo_ia = 'IA'`; **116 activas en 24 h**.

> ⚠️ **Corrección de un análisis previo.** Primero se concluyó que el bot llevaba
> 24 días callado, mirando la columna `inbox.mensajes.respuesta_ia` (última marca:
> 5-jul). Esa columna **no la escribe `responderConIA`** —manda por `/api/saliente`
> sin marcarla, es un resto de la época de Make—, así que el dato no medía nada. Los
> logs de invocación del agente son la fuente correcta y dicen lo contrario.
> **Método:** para saber si un bot está vivo, mirar sus invocaciones, no una columna
> que quizá nadie escribe.

> ⚠️ **Segunda corrección, posterior a este plan.** El resto de este documento
> (§3.2, §4 y el paso 6 de §6, en su redacción original) asumía que
> `IA_AUTORESPUESTA` seguía **apagada**. Es falso: **está ENCENDIDA en
> producción**. Lo que pasa hoy es que `indx-agent` devuelve **error 500 en
> cada llamada**, así que el bot no responde por estar **roto**, no por tener
> el interruptor maestro apagado. Son dos cosas distintas y con reversa
> distinta: un interruptor apagado se prende con un click; un agente roto hay
> que arreglarlo. Las menciones de "sigue apagada" más abajo quedan
> corregidas para reflejar esto.

**Consecuencia, y razón de ser de este plan:** hoy, si el bot se desboca o dice algo
que no debe, la única forma de pararlo es editar `IA_AUTORESPUESTA` en Vercel y
**esperar un redespliegue**. Con 116 conversaciones vivas, esos minutos son mensajes
enviados a clientes reales que no se pueden recoger.

### 2.3 Hay DOS formas distintas de preguntar "¿va a contestar el bot?"

| Camino | Línea | Cómo decide |
|---|---|---|
| Saludo automático | 251 | `agenteResponde(phone)` = `IA_ON && modoIAde(phone)` — usa una **foto** de la agenda |
| Auto-respuesta | 308-311 | `IA_ON && …` y después `await getModoIA(phone)` — **relee la base** |

Dos criterios para la misma pregunta. Si el cortafuegos se enchufa en uno y no en el
otro, el bot quedaría bloqueado para responder pero seguiría saludando (o al revés).
**El diseño mete la reja en un solo sitio del que dependan los dos.**

### 2.4 Los canales de IND se llaman distinto

`lib/canales.js` usa `id: 'principal'` (3326) y `id: 'secundario'` (9804) — no
`MANDI`/`REPUBLIC`. Las llaves de configuración deben ser esas.

Además `META_PHONE_ID` y `META_WABA_ID` se actualizaron hace 18 h (la WABA nueva de
ayer). El comentario de `lib/canales.js` todavía dice `1135333936337730`, que es el
número **muerto**: es solo un comentario desactualizado, el valor real sale del env,
pero conviene corregirlo para que nadie se guíe por él.

### 2.5 De paso: el cron de seguimientos de IND está doblemente inerte

Mismo código de autorización que MANDI (`x-vercel-cron` **o** `CRON_SECRET`) y
**tampoco tiene `CRON_SECRET`** → devuelve 401 todos los días. Y aunque se arreglara,
la config de IND **no tiene bloque `seguimientos`**, así que saldría por `skipped`.

**No está en este plan.** Lo anoto para que no se descubra por sorpresa.

## 3. Diseño

### 3.1 La reja nueva se SUMA, nunca reemplaza

```js
agenteResponde = IA_ON  &&  iaActivaEnCanal(config, phoneId)  &&  (modo IA del chat)
```

`IA_AUTORESPUESTA` sigue siendo el interruptor maestro. El nuevo es un segundo
candado, más fino.

**Propiedad de seguridad que se deriva de esto, y que es la razón del diseño:**
este cambio **no puede encender nada que hoy esté apagado**. En el peor caso posible
—un error en el código nuevo— el bot contesta menos, nunca más.

### 3.2 Configuración

En `inbox.automatizaciones.config` de la cuenta `IND`:

```json
"ia": { "principal": true, "secundario": true }
```

- **Booleanos planos**, no `{activo:…}`: el `merge()` de IND también es de un solo
  nivel y un objeto anidado borraría el canal hermano.
- Llave = **id lógico** del canal, nunca el `phone_id`: a IND ya le cambió el
  `phone_id` ayer, y una config guardada por número habría quedado huérfana.
- Arranca en `true` **a propósito**: desplegar no debe cambiar el comportamiento.
  Esto no depende de si `IA_ON` está prendido o apagado — el candado nuevo solo
  puede restar, nunca sumar (§3.1), así que arrancar en `true` deja el
  comportamiento de hoy intacto sea cual sea el estado del maestro.

### 3.3 Dónde se aplica

Un módulo nuevo `lib/ia-canal.js` (portado del de MANDI, ya revisado y en producción),
y el webhook pasa a decidir en **un solo punto** que cubra los dos caminos del §2.3:

- `agenteResponde(phone, phoneId)` incorpora la reja de canal.
- El bloque de auto-respuesta (línea ~308) pasa a usar **esa misma función** en vez de
  `IA_ON` suelto, conservando su relectura de base (`getModoIA`) como segundo candado.

Un canal desconocido **no bloquea** (devuelve `true`): fallar cerrado dejaría el bot
mudo en silencio si vuelve a cambiar un `phone_id`, y en IND eso ya pasó.

### 3.4 Interfaz

Tarjeta **primera** en la pestaña AUTOS de IND, con un interruptor por número
(3326 y 9804), recorriendo `CANALES`. IND ya tiene `guardarInterruptor` (se guarda
solo y revierte si falla), así que se reusa.

La tarjeta debe decir **explícitamente** que además existe el maestro
`IA_AUTORESPUESTA`, para que nadie apague aquí creyendo que apagó todo, ni encienda
aquí esperando que el bot hable.

## 4. Lo que NO se toca

- `IA_AUTORESPUESTA` **no se modifica**. Hoy está **ENCENDIDA** en producción
  (ver corrección en §2.2): el bot no responde porque `indx-agent` está roto
  (error 500 en cada llamada), no porque este interruptor esté apagado.
- **No se toca `modo_ia` de ningún chat.** Los 876 quedan como están.
- No se toca el camino de los mensajes entrantes, ni saludos, ni estados, ni bandejas.
- No se toca nada de la WABA ni de los números: IND está recién reconstruido y frágil.
- No se arregla el cron (§2.5).

## 5. Tareas

| | Qué | Archivos |
|---|---|---|
| **T1** | `lib/ia-canal.js` portado + pruebas | `lib/ia-canal.js`, `tests/ia-canal.test.js` |
| **T2** | `DEFAULTS.ia` + exportar `merge` + pruebas | `lib/automatizaciones.js`, `tests/automatizaciones-merge.test.js` |
| **T3** | La reja en el webhook, en un solo punto | `app/api/webhook/route.js` |
| **T4** | Tarjeta en AUTOS + corregir el comentario muerto de `canales.js` | `components/Automatizaciones.jsx`, `lib/canales.js` |
| **T5** | Verificación en producción | — |

**Prerrequisito de T1:** `package.json` corre hoy `node --test tests/push.test.js`
(un archivo fijo, no un patrón), así que un test nuevo **no se ejecutaría**. Hay que
cambiarlo a `tests/*.test.js`. Sin eso, las pruebas nuevas serían decorativas.

Base actual: **15 pruebas en verde**. Al terminar: **~24**.

## 6. Verificación antes de dar por bueno

1. `npm test` y `npm run build` limpios.
2. Desplegar y confirmar el SHA en Vercel.
3. En AUTOS, apagar el canal **9804** y confirmar en la base que se guardó:
   `select config->'ia' from inbox.automatizaciones where cuenta='IND';`
4. Recargar la página: debe seguir apagado (que no mienta la pantalla).
5. **Que un cliente escriba a cada número y que su mensaje ENTRE normal.** Es lo
   crítico: el cortafuegos no puede afectar la recepción. Si dejaran de llegar
   mensajes, se revierte de inmediato.
6. Confirmar que, si el bot sigue sin responder tras el deploy, es por el error
   500 de `indx-agent` (ver corrección en §2.2) — `IA_AUTORESPUESTA` está
   ENCENDIDA en producción, no apagada. No confundir "roto" con "apagado".
7. **La prueba que de verdad valida la reja, ya con `indx-agent` funcionando
   (no roto):** apagar un número en AUTOS, escribir desde un chat con la IA
   prendida para ese número, y confirmar en los logs que **NO** aparece
   ninguna llamada a `indx-agent` para ese `phone_id`. Prender el número de
   nuevo y confirmar que la llamada **SÍ** vuelve a aparecer.

## 7. Riesgos y reversa

| Riesgo | Mitigación |
|---|---|
| Romper la recepción de mensajes | La reja solo se consulta en la rama de auto-respuesta y saludo; no toca el guardado. Paso 5 de §6 lo verifica. |
| Que el bot empiece a hablar | Imposible por diseño (§3.1): la reja solo puede restar. |
| `phone_id` que no calce | Canal desconocido no bloquea; el comportamiento queda igual al de hoy. |
| Cambio malo en producción | **Reversa: `git revert` del commit + redeploy.** No hay migración de base ni cambio de datos, así que revertir el código deja todo exactamente como estaba. |

**No hay ningún cambio de esquema ni de datos en este plan.** Es la razón por la que
la reversa es limpia, a diferencia de lo de ayer.

## 8. Lo que este plan deja abierto, a propósito

- **Los 876 chats con la IA prendida** siguen así: el bot les seguirá contestando
  igual que hoy. Este plan solo añade la forma de pararlo por número. Revisar cuáles
  de esos 876 deberían volver a `HUMANO` es una conversación aparte, y grande.
- El cron de seguimientos de IND (§2.5).
- Los echoes del celular para IND (lo que se hizo hoy en MANDI).
