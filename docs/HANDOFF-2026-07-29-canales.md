# HANDOFF — IND INBOX · 27-29 jul 2026

Proyecto Vercel **`ind-inbox-v2`** · repo PÚBLICO · producción = `main`.
Último commit desplegado: **`7f23005`**.

> Hay un handoff gemelo en `wa-inbox-next/docs/`. Los mismos cuatro bugs de fondo
> salieron en los dos inbox: si tocas uno, revisa el otro.

---

## 1. Lo que pasó, en orden

Dos cosas encadenadas:

1. **El 27-jul a las 20:40 EC el número dejó de despachar.** 22 horas caído, con
   pauta corriendo. Resuelto el 28.
2. Al resolverlo se destaparon **cuatro bugs** que llevaban tiempo mintiendo en
   pantalla, y que también existían en MANDI.

## 2. El apagón: causa y solución

**Causa:** la WABA quedó en estado `ONBOARDING` con moneda `AED` tras un cambio de
socio. Meta lo disfraza como `HTTP 500 code=1` — el error interno genérico, sin
subcódigo. **No** era token vencido (sería 190), **no** eran permisos (200/403),
**no** era el problema de pago (131042), **no** era caída general de Meta (MANDI
seguía enviando con la misma Cloud API).

Se aisló por experimento: enviar por una WABA sana con el **mismo token, misma
app, mismo código** funcionó 2 de 2. Solo la WABA rota fallaba.

**Solución: una WABA creada A MANO.** Las que se crean por el flujo automático
salen mal configuradas (región India, moneda AED, estado ONBOARDING).

| | ID | Número |
|---|---|---|
| **WABA nueva** | `1043571971409840` | |
| **3326** (principal) | phone `1153686904504422` | +593 99 995 3326 |
| **9804** (segundo) | phone `2241248862581450` | +593 98 415 9804 |
| WABA del 9804 | `396966121059860` | |

Definidos en **`lib/meta-ids.js`** y **`lib/canales.js`**. Tras el cambio:
136 enviados / 132 entregados / 49 leídos.

### ⚠️ Lo que hay que saber si se vuelve a mover un número
- **Mover el número REINICIA la ventana de 24 h.** Todo el histórico pasa a dar
  `131047`. Por eso hacen falta las plantillas (ver pendientes).
- **Hay que migrar el `phone_id` en Supabase** o la bandeja sale vacía.
- **NO reintentar `register`.** Un `deregister` seguido de reintentos de `register`
  choca contra el límite `133016` y deja el número **sin enviar NI recibir**
  durante horas. Pasó, y costó medio día.

## 3. Commits relevantes

| Commit | Qué |
|---|---|
| `787afcc` | El inbox marcaba **ATENDIDO y pintaba el visto aunque el envío fallara** |
| `4eda7bb` | Seguridad: token por cabecera, nunca en la query string |
| `41e79fb`, `e715543`, `4878655`, `ebac6e8`, `df0a4da` | ⚠️ TEMPORALES — diagnóstico y migración por API |
| `ee1d30e` | Una sola fuente para el phone id y el waba id (`lib/meta-ids.js`) |
| `744f383` | Guardar **por qué número** entró o salió cada mensaje |
| `5ebbadc` | El inbox muestra solo el número principal (antes de existir el filtro, las bandejas se mezclaron) |
| `09dcf61` | **Botones de número** en la cabecera |
| `26aeb70` | El estado dejaba de revertirse solo tras cambiarlo |
| `bb0259b` | **Apuntar al número en su WABA nueva — despacho restablecido** |
| `6ac35e8` | El **saludo automático salía por el 3326** a clientes del 9804 |
| `8bab7cc` | El saludo se volvía **spam**: uno por cada mensaje + el interruptor no guardaba |
| `7f23005` | **ARCHIVAR** no pegaba en clientes que escribieron a los dos números |

---

## 4. Los cuatro bugs, y por qué importan más que su arreglo

Los cuatro son **la misma falla**: *la pantalla decía una cosa y el sistema hacía
otra*. Si vas a agregar algo acá, esto es lo que hay que no repetir.

### 4.1 El ✓ en un envío que falló — `787afcc`
El inbox marcaba el chat ATENDIDO y pintaba el visto **antes** de saber si Meta
había aceptado. Durante el apagón, chats sin responder salieron de PENDIENTES y
nadie los volvió a mirar. Regla: el estado se guarda **solo si el envío salió**;
el mensaje fallido se queda visible, en rojo, con botón de reintentar, y **no se
borra solo a los 90 s**.

### 4.2 El canal no viajaba en los envíos del servidor — `6ac35e8`
El webhook y el cron no tienen "canal activo" de pestaña, así que caían al número
principal. El cliente escribía al 9804 y el saludo salía por el 3326 — un número
al que ese cliente nunca escribió, con la ventana de 24 h cerrada.

**Consecuencia medida (28-jul, 19:01 a 23:28 EC): 69 saludos por el número
equivocado, 57 FALLARON, 22 clientes no recibieron nada.** Los 12 que llegaron
eran clientes que además ya habían escrito al 3326 alguna vez.

### 4.3 La agenda filtrada por canal *(la más cara)* — `8bab7cc`, `7f23005`
El webhook cargaba los contactos **filtrados por el número principal**. Un
contacto del 9804 no aparecía nunca en esa lista, y de ahí salían tres mentiras:

- `esNuevoDe()` daba **siempre true** → lo saludaba como nuevo **en cada mensaje**.
  **Un solo cliente (`593995506848`) recibió 11 saludos seguidos.** Riesgo real de
  que Meta bloquee el número por spam.
- `estadoDe()` nunca lo veía 'atendido' → no lo reabría a PENDIENTE
- `getModoIA()` daba la IA por apagada a todos los clientes del 9804

Y en la pantalla: la lista se filtra por el canal del **mensaje**, pero el estado
vive en la **conversación**, que se filtraba por el suyo. Un cliente con mensajes
en los dos números aparecía en una lista con la ficha del otro lado: **ARCHIVAR
era imposible** desde esa bandeja. Afectó a **40 clientes en IND** (6 en MANDI).

**La regla, escrita:** el filtro por número aplica a los **MENSAJES**, nunca a la
**AGENDA**. Hay UNA ficha por cliente (`cuenta` + `telefono`), no una por número.

### 4.4 El interruptor que no guardaba — `8bab7cc`
En la pestaña AUTOS el switch solo cambiaba el estado visual: no se aplicaba hasta
apretar *"Guardar cambios"*. Se veía apagado y seguía prendido en la base
mandando mensajes. Ahora los interruptores se guardan solos, y **si el guardado
falla el switch vuelve donde estaba** en vez de mentir.

---

## 5. ⚠️ Estado actual de las automatizaciones

`saludo_nuevo` está **APAGADO**. Lo apagué a mano en la base el 28-jul para cortar
el spam. **Hay que volver a prenderlo** desde la pestaña AUTOS, ya con el código
nuevo (si se prende con el código viejo, se repite).

---

## 6. Pendientes, por prioridad

### 6.1 🔴 Recrear las 4 plantillas — lo más caro en dinero
Mover el número reinició la ventana de 24 h, así que **~1.000 clientes de IND
quedaron fuera de alcance** hasta tener plantillas aprobadas:
`recuperar_conversacion_ind`, `confirmacion_pedido_ind`, `abandono_carrito_ind`,
`reactivacion_clientes_ind`.

### 6.2 🔴 Borrar las rutas temporales — **el repo es PÚBLICO**
Siguen vivas en producción, **6 rutas**:

```
app/api/diag-meta/
app/api/admin/migrar-numero/     ← mueve un número entre WABAs
app/api/admin/nombre-visible/
app/api/admin/probar-envio/      ← manda WhatsApp desde tus números
app/api/admin/rescatar-media/
app/api/admin/suscribir-app/
```

Están protegidas por clave, pero cualquiera que lea el repo sabe que existen y qué
hacen; lo único que las separa de tus números es una variable de entorno.

### 6.3 🟠 Los 7 clientes que siguen sin respuesta
De los 22 que perdieron el saludo, **7 seguían en PENDIENTE** al cierre (ventana
de 24 h todavía abierta): Christian Palacios, Elena Segovia, **mela…** (escribió
11 veces sin respuesta), ~Jose David C., Marcelo, Sarah, Bricio.
Los otros 15 ya fueron tomados a mano.

### 6.4 🟠 Repo a privado, y recién después revocar el token de 60 días
Quedó expuesto en el Graph API Explorer. ⚠️ **Ojo con el orden:** "Revocar
identificadores" mata **TODOS** los tokens de ese usuario de sistema, incluido el
que usan los inbox. Hay que tener el reemplazo listo antes de apretar.

### 6.5 🟡 Aviso de ventana cerrada en el compositor
Hoy el botón de enviar deja mandar aunque la ventana de 24 h esté cerrada. El
vendedor escribe y el mensaje se pierde.

### 6.6 🟡 Pruebas de canal: hoy hay **cero**
Los 15 tests no cubren nada multi-número, y por eso cuatro bugs de la misma
familia llegaron a producción en 24 h.

### 6.7 🟡 Monitoreo — lo que más falta
**Nada avisó de nada.** Los 57 saludos fallidos se encontraron por casualidad. Un
chequeo diario de `estado_entrega='failed'` en las últimas 24 h lo habría cazado.

### 6.8 🟡 `message_echoes`
Para que lo que se responde **desde el celular** aparezca en el inbox.

### 6.9 Decisión pendiente del dueño: la pauta
Dos campañas activas (`CAMPAÑA XAVIER`, `MEJORES PRODUCTOS`) apuntan al número de
IND. El dueño dijo **"NO HAGAS NADA"** al respecto. No tocar sin que lo pida.

---

## 7. Trampas para el que siga

- **Producción es `main`.** Nada de ramas.
- **`vercel env pull` devuelve los secretos VACÍOS.** No se puede reproducir nada
  localmente con credenciales de producción: hay que diagnosticar desde una ruta
  desplegada y con clave.
- **Un 200 de la Graph API no es prueba de entrega.** El estado real está en
  `inbox.webhook_eventos` y en `inbox.mensajes.estado_entrega`.
- **`code=1` + HTTP 500 de Meta es el error interno genérico.** No dice nada por sí
  solo: hay que mirar el estado de la WABA (`status`, `currency`,
  `account_review_status`) para saber qué pasa de verdad.
- **NO reintentar `register`** — ver la advertencia del punto 2.
- **La conversación es por `cuenta` + `telefono`**, no por número. Archivar a un
  cliente lo archiva en las dos bandejas: es un solo cliente con una sola ficha.
- **Antes de creer que se borraron mensajes**, cruzar `inbox.webhook_eventos`
  contra `inbox.mensajes`. Ya pasó una vez y era la ventana de lectura, no una
  pérdida de datos.
- `inbox.conversaciones` **no tiene** columna `updated_at`.
