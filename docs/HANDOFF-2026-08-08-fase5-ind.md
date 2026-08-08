# HANDOFF — Fase 5 CERRADA: IND al mismo nivel que MANDI

Fecha: 8-ago-2026. Con esto se cierran las cinco fases del proyecto.

- Spec: `docs/superpowers/specs/2026-08-06-login-crm-y-pedido-en-inbox-design.md`
  (en el repo `wa-inbox-next`)
- Handoffs previos, en `wa-inbox-next`:
  `HANDOFF-2026-08-07-fase2-cerrada.md` · `HANDOFF-2026-08-08-fase3-pedido-manual.md`

---

## 1. Qué quedó funcionando en IND

| | Estado |
|---|---|
| **Candado de sesión** | ✅ `AUTH_MODO=bloquear`. API sin cookie → 401; páginas → login del CRM |
| **PEDIDO MANUAL** | ✅ la pantalla real del CRM dentro del panel |
| **Botón 🤖 con IA** | ✅ quitado, igual que en MANDI |
| **`indx-agent/api/crear-pedido`** | ✅ cerrado: 200 → 401 |
| **Clave del agente** | ✅ rotada (estaba publicada en GitHub) |

**Commits:** `2817f81` (pedido manual) → `f1b1bb9` (quitar IA) → `f867d3b` (candado).
En `indx-agent`: `f617811` (rotación) → `77d5051` (cerrar endpoint).

### Verificación en producción, tras encender

```
API sin cookie      -> 401
Página sin cookie   -> 307 al login del CRM, con `volver` de regreso
Meta GET webhook    -> 403   (intacto)
Meta POST webhook   -> 200   (intacto, sigue recibiendo)
cron                -> 401 propio de CRON_SECRET, no del candado
```

Rodrigo y Xavier probaron en vivo: **entra y sale OK**. Cero mensajes fallidos,
y **ningún 401 de un usuario real** en los registros — solo las sondas.

## 2. Por qué acá NO hizo falta la ventana de 24-48 h

En MANDI se corrió 40 minutos porque Rodrigo es el único que lo atiende. En IND
había gente trabajando (1.900 envíos en 3 días), así que el plan exigía la
ventana completa. **Lo que la volvió innecesaria fue una circunstancia, no una
decisión de riesgo:**

- Rodrigo estaba **sentado al lado** de la persona que atiende IND.
- Esa persona entra con la cuenta **Xavier Castillo**, que ya tenía
  `INBOX_INDSTORE`. Rodrigo usa **Andrés Admin**, que también.
- O sea: **nadie podía quedarse fuera.**

La ventana existía para descubrir a gente que no está mirando. Estaban las dos.

**El método que confirmó que era seguro encender:** con el candado en modo
observación, se miró el registro mientras Rodrigo entraba. Sus peticiones
(`/inbox`, `/api/inbox-sync`) aparecieron **sin ninguna línea `[auth] rechazaria`**.
Que el middleware corra y no anote nada demuestra que pasó las tres puertas: la
firma validó, la cookie cruzó de `crm.` a `ind-inbox.`, y `crm.usuarios` confirmó
el permiso. Es el mismo diagnóstico que se usó en MANDI y no requiere adivinar.

## 3. Lo que IND tiene distinto de MANDI

| | MANDI | IND |
|---|---|---|
| Rutas totales | 35 | 28 |
| **Rutas públicas** | 4 | **2** (`/api/webhook`, `/api/cron/seguimientos`) |
| SOCIAL (FB/IG) · dLocal | sí | **no** |
| Ancho mínimo del panel | 280 | 260 |
| Caminos que sueltan la conversación | 6 | **5** |

Ese último merece explicación: en IND el 👋 de CONTACTOS/AUTOS **no lleva guard a
propósito**, porque ahí esas vistas solo esconden el chat con `display:none` y el
formulario sobrevive; preguntar sería ruido. En MANDI sí desmonta. **No se copió
la lista: se verificó.**

Y se agregó `apple-touch-icon` al `matcher` (no está en MANDI): es un estático que
el navegador pide sin cookie. Hoy solo ensucia el registro, pero **vale revisarlo
en MANDI** antes de que allá caiga al login.

## 4. ⚠️ Lo que quedó abierto, a sabiendas

### 4.1 El webhook de IND no verifica la firma de Meta

El inventario decía que sí; **en el código de IND eso no existe**. El `GET` valida
`WHATSAPP_VERIFY_TOKEN`, pero el `POST` acepta cualquier cuerpo — comprobado
mandando `{}` y respondiendo 200.

**Consecuencia:** cualquiera que conozca la URL puede inyectarle mensajes falsos
al inbox de IND. Es anterior a este trabajo y el candado no lo empeora (esa ruta
queda pública a propósito, porque Meta no puede tener sesión), pero es real y
merece su propio arreglo. MANDI sí verifica firma con `META_APP_SECRET`.

### 4.2 El endpoint cerrado quedó además huérfano

`indx-agent/api/crear-pedido.js` ya no tiene quién lo llame: el botón se quitó.
Cerrarlo era lo urgente; **borrarlo sería lo definitivo**. Igual en `mandi-agent`.

### 4.3 El hueco del guard al cruzar los 767 px

Heredado de MANDI (§5.2 de su handoff), presente en los dos repos: abrir el manual
en escritorio, achicar la ventana por debajo de 767, abrir el cajón y confirmar la
✕ deja el guard apagado con el formulario vivo. Angosto pero real. **Conviene
arreglarlo en los dos a la vez.**

### 4.4 `INBOX_API_TOKEN` sin cargar

Si alguna máquina llamara al inbox de IND, hoy recibiría 401. El inventario no
encontró ninguna, y el modo observación tampoco la delató — pero la ventana fue
corta. Si aparece algo raro, ese es el primer sitio donde mirar.

## 5. Costos y rendimiento

Rodrigo pidió explícitamente que esto no encareciera ni ralentizara sus apps.

**Costo:** el candado agrega una consulta a Supabase por petición protegida
—unas **1.700 al día** en IND— sobre una tabla de **14 filas y 128 kB** que cabe
en memoria y se ejecuta en **0,125 ms**. Plan Pro ya pagado; ningún servicio
nuevo. Se relee en cada petición **a propósito**: es lo que hace que revocar un
acceso surta efecto de inmediato en vez de a los 30 días.

**Saldo a favor:** el botón de IA que se quitó gastaba créditos de Anthropic en
cada uso, y los dos endpoints cerrados podían quemarlos desde internet sin límite.

**Latencia — lo que se midió y lo que no.** Cinco muestras: la ruta con candado
respondió en 0,35–0,43 s y la ruta sin candado (el webhook) en 0,46–0,50 s. Eso
**no prueba** que el candado sea gratis: son rutas distintas y la medición es
desde una red doméstica. Solo demuestra que rechazar no cuesta nada.

⚠️ **El tramo que sí agrega un viaje de red —la lectura a Supabase— NO se pudo
cronometrar**, porque solo ocurre en peticiones con sesión válida y la medición se
hizo sin cookie. No se estimó para no inventar un número.

**Si algún día se nota lento:** guardar el permiso en memoria unos segundos en vez
de releerlo siempre. Se pierde inmediatez al revocar (segundos, no días) y se
ahorran casi todas las consultas. No se hizo por adelantado: optimizar sin medir
es cómo se rompe lo que funcionaba.

## 6. Lo que sigue

1. **Crear un pedido real desde IND**, para cerrarlo como se cerró MANDI con
   `MAN-AND-5563` — confirmando en la base que sale con el vendedor correcto y
   tienda INDSTORE.
2. **Ponerle firma al webhook de IND** (§4.1).
3. **Cargar créditos de Anthropic** y probar los dos agentes. MANDI ya tiene la
   memoria arreglada (lee el hilo directo de Supabase); IND también. ⚠️ Si IND no
   contesta, revisar `IA_AUTORESPUESTA`: es un interruptor global que MANDI no
   tiene.
4. **El cartel de "IA activa"**: hoy el inbox dice "🤖 IA respondiendo
   automáticamente" aunque no haya créditos. En 7 días, 98 clientes de MANDI y
   203 de IND escribieron a un chat así y nadie les contestó.
5. Los pendientes menores de §4.2, §4.3 y §4.4.
