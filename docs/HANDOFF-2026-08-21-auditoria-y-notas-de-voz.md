# IND — auditoría completa y notas de voz (21-ago-2026)

Dos trabajos en el mismo día: una **auditoría del 100% del repo** pedida antes de
tocar nada («es CRÍTICO que bajo ningún concepto nos quedemos sin servicio en ese
número»), y el **porte de las notas de voz** desde MANDI.

Ambos cerrados y verificados en producción con envíos reales.

---

## 1. Auditoría — el estado real de IND

Punto de partida: `df5c788` (15-ago), local = `origin/main` = producción.
15.349 líneas, 105 archivos, 256 pruebas verdes.

### Lo que está sano, con evidencia

| Qué | Cómo se comprobó | Resultado |
|---|---|---|
| **Recepción** | wamids de `webhook_eventos` cruzados contra `mensajes`, 7 días | **3.875 llegaron, 3.875 guardados. CERO perdidos** |
| Envío | fallidos / total, 30 días | 8 sobre 28.690 = **0,03%**, todos por números de cliente inválidos |
| Webhook | lectura del código + control negativo | 403 propio (no del candado); respalda el POST crudo con `waitUntil` antes de procesar |
| `/api/saliente` | grep de `res.ok` | **Sí lo mira** — no se traga un rechazo de Meta |
| Crons vs candado | `vercel.json` contra el `matcher` | Los dos excluidos. **No tiene el bug que sí tenía MANDI** |
| Telegram y push | huellas en `conversaciones` | Vivos: 269 y 249 avisos en la semana |

**Control negativo que valida todo lo anterior:** `/api/webhook` responde 403 (su
propia validación de Meta) mientras una ruta inventada responde 401 (el candado).
Códigos distintos ⇒ la señal significa algo.

### Los dos números, y su estado real

| Número | phone_id | Estado |
|---|---|---|
| **9804** (coexistencia, vive en el celular) | `2241248862581450` | El que trabaja: 14.577 entrantes / 28.690 salientes en 30 días |
| **3326** (principal) | `1153686904504422` | En desuso. Meta no mandó **nada** de él entre el 10 y el 21-ago |

⚠️ **Ojo con la lectura de eso.** Durante la auditoría di el 3326 por muerto y me
equivoqué: Rodrigo lo probó y funciona (recibe y envía por la API, verificado
13:10). **Ausencia de tráfico ≠ número desactivado.** El dato era correcto, la
inferencia no.

Lo que sí queda en pie: el 3326 es el `CANAL_POR_DEFECTO` del código, así que
cualquier envío que NO especifique canal sale por el número que casi no se usa.
Hoy no duele porque `postSaliente` inyecta `Canal: CANAL_ACTIVO` en **todos** los
envíos — pero es la clase de cosa que muerde cuando alguien agrega un camino nuevo.

### Pendientes que la auditoría destapó (ninguno urgente)

1. **El cron de seguimientos nunca ha mandado uno.** Está programado a diario, pero
   `inbox.automatizaciones.config` de IND **no tiene la sección `seguimientos`**.
   No revienta —sale con `skipped: 'seguimientos apagado (global)'`— así que es una
   función sin configurar, no un fallo. Si se quiere usar, hay que configurarla.
2. **Un solo celular suscrito a push** (`inbox.push_subs` con `cuenta='IND'`). Si
   atiende más de una persona, a las demás no les llega nada.
3. **0,1 % de salientes se quedan sin ✓✓** (3 de 2.824 en 7 días). Meta manda el
   estado y el `UPDATE ... WHERE wa_message_id = X` no encuentra la fila: es una
   carrera, el status llega antes de que termine el insert. No se pierden mensajes,
   solo el acuse. En MANDI y REPUBLIC es 0 %.
4. Una rama `claude/mandarinaec-interactive-store-rik1jo` con trabajo de Shopify
   colada en este repo. **Solo generó previews**, nunca producción.

### ☠️ Lo que MÁS falta

**El aviso de entregas fallidas existe solo en MANDI.** IND manda ~28.690 salientes
al mes y **nadie se entera si uno muere**: el único indicio es un `⚠` de 11 px con
el motivo en un `title=`, invisible al tacto en un celular.

En MANDI eso se resolvió el 21-ago con `/api/cron/entregas` cada 30 min + la rpc
`inbox.entregas_fallidas`, que saca el código real de Meta del payload crudo y dice
por qué otro número SÍ se puede escribir. **Portarlo a IND es el siguiente paso
obvio**, y la rpc ya funciona para `cuenta='IND'` (probada: 59 casos de 131047 y 8
de 131026).

⚠️ Al portarlo: **agregar `api/cron/entregas` al `matcher` de `middleware.js`**. En
MANDI se desplegó sin eso y el cron estuvo muerto desde el primer minuto — Vercel lo
llamaba, el candado lo mandaba al login, y no corría nunca. Hay una prueba que lo
caza (`tests/rutas-publicas.test.js` en MANDI); conviene portarla también.

---

## 2. Notas de voz — qué se construyó

**Estado: EN PRODUCCIÓN (`82bd885`), probado con envíos reales.**

- Arrastrar / pegar / clip un audio en el chat → sale como **nota de voz**
- Guardar audios en una **respuesta rápida**, mezclados con fotos **en el orden en
  que se cargan**

### La regla de Meta

Para que WhatsApp pinte la burbuja de nota de voz (micrófono, ondas, 1x/1.5x) el
archivo tiene que ser **OGG con codec OPUS**. Cualquier otro formato llega como
archivo adjunto: suena igual, pero se ve como envío masivo en vez de una persona
hablándote.

Las voces generadas (Fish Audio) salen en **MP3**, así que **siempre** hay que
convertir.

### Dónde se convierte, y por qué ahí

En el **NAVEGADOR** (`lib/audio-nota-voz.js`). Convertir son dos pasos —decodificar
el MP3 y codificar a Opus— y el navegador ya sabe el primero gratis
(`decodeAudioData`, API nativa). En el servidor harían falta los dos: **ffmpeg pesa
80 MB**, demasiado para una función con arranque en frío.

El codificador (`public/opus/encoderWorker.min.js`, de opus-recorder, MIT) son
385 KB que se cargan **solo cuando alguien manda un audio**.

Medido: 19,85 s de MP3 (317 KB) → OGG/Opus (81 KB) en **0,55 s** (44× tiempo real),
y pesa **4× menos**.

### ☠️ Las cuatro trampas — todas ya corregidas acá

Aparecieron en MANDI y costaron dos envíos muertos, un adjunto perdido y una
respuesta guardada sin audio. IND se las llevó ya resueltas.

1. **Al codificador hay que PEDIRLE las cabeceras.** Tiene un comando
   `getHeaderPages` que genera `OpusHead` y `OpusTags`, y hay que llamarlo
   **después del mensaje `ready`** (antes, `this.encoder` no existe y se descarta).
   Sin eso sale un OGG con todo el audio y sin decir qué codec es: Meta lo rechaza
   con **131053 «Media upload error»** y ni ffmpeg puede abrirlo.
2. **El campo moría en `writeReply`.** Ese cuerpo enumera campos a mano y no incluía
   `adjuntos`: el editor guardaba bien, la base aceptaba bien, y el audio no llegaba
   a existir — **sin ningún error**. Ahora vive en `cuerpoDeRespuesta`, probado.
3. **Subir dos adjuntos seguidos perdía uno.** El editor armaba la lista desde el
   valor del render en que se hizo clic; el segundo partía de la lista vieja y
   pisaba al primero. Ahora usa updater funcional.
4. **El filtro descartaba las respuestas SIN TEXTO.** Una que fuera solo un audio
   habría desaparecido de la lista. Ahora mira si hay **algo** que mandar.

### Cómo verificar un audio en 5 segundos

```js
const b = require('fs').readFileSync('x.ogg')
b.slice(0,4).toString()    // 'OggS'      → contenedor
b.slice(28,36).toString()  // 'OpusHead'  → codec. Si no dice esto, Meta lo rechaza.
```

### Otras trampas del formato

- Fish Audio suelta archivos `.mp3.mpeg` y **Windows los marca `video/mpeg`**. Si se
  mirara solo el tipo se mandarían como VIDEO y Meta los rechazaría: `esAudio` mira
  también el nombre, y el audio se decide **antes** que el video en `decidirAdjuntos`.
- Un `.ogg` genérico **también se convierte**: puede llevar Vorbis, y Meta dice
  «OPUS codecs only». Medio segundo de seguro contra un mensaje perdido.
- **El audio NO acepta caption**: texto + audio salen como dos mensajes.

### El orden de los adjuntos

> «debe respetar el orden en el que cargué los adjuntos»

WhatsApp entrega cada adjunto como un mensaje aparte, así que **el orden de carga es
el que ve el cliente**. Por eso existe `respuestas_rapidas.adjuntos` (jsonb,
`[{tipo,url}]`): dos columnas separadas (`imagenes` y `audios`) **no pueden expresar
"foto, audio, foto"**.

⚠️ **Los audios NO van en `imagenes`** aunque el tipo se pudiera deducir de la
extensión: esa columna la comparten los dos inbox y quien no sepa de audios los
mandaría como fotos. Se escribe `imagenes` en paralelo, solo con fotos.

En una respuesta rápida el audio se convierte **una sola vez, al guardarla**; usarla
después solo manda el link (medido: texto y audio salieron con 1,4 s de diferencia).

---

## Verificado en producción el 21-ago

| Prueba | Resultado |
|---|---|
| Audio suelto al chat (13:35 y 13:36) | `delivered` y `read`, bytes con `OpusHead` ✅ |
| Respuesta rápida con texto + audio (14:27) | texto → audio con 1,4 s, ambos `delivered` ✅ |
| La respuesta se guardó con su audio | `adjuntos` = 1, tipo audio ✅ |

Y quedó despejada la duda que abrió la auditoría: **el 9804 en coexistencia SÍ
acepta audio por la Cloud API**.

## Qué NO se tocó (verificado con `git diff`)

`app/api/webhook/route.js` · `middleware.js` · `lib/rutas-publicas.js` ·
`vercel.json` · `lib/canales.js` · `lib/meta-ids.js` · los dos crons.

`app/api/saliente/route.js` **solo gana** el bloque de audio: no se borró ni una
línea. El código nuevo solo se activa con `body.AudioURL`.

Sin migración: `adjuntos` y `audios` ya existían en la tabla compartida.

## Trampa de método que me mordió (para el próximo)

Buscando la prueba de Rodrigo, filtré «los 3 audios más recientes de IND» y **tres
notas de voz grabadas desde el celular taparon las suyas**. Casi le reporto que su
envío había fallado.

El error no estaba en el dato sino en **mi consulta**: ordené por lo más reciente en
vez de filtrar por lo que buscaba (`raw is null` = enviado por la API). Auditar la
herramienta antes que el sistema no es un adorno.
