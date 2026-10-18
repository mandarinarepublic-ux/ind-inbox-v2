# Indi: entrenamiento desde el inbox IND — diseño

Fecha: 18-oct-2026 · Pidió: Rodrigo · Repos: `ind-inbox-next` (inbox, Vercel `ind-inbox-v2`) y `indx-agent` (Indi, Vercel `indx-agent`).

## 1. Para qué y por qué

Indi es el agente de ventas de WhatsApp de IND STORE. Hoy todo lo que sabe está escrito a mano en
`indx-agent/lib/systemPrompt.js` (v2.0) y está viejo: tallas S–XXL, "hoodies premium $50", "envíos 2 a 3 días",
sin precios personalizados ni direcciones de las tiendas. En julio, cuando estuvo prendida, inventó cosas
("somos 100 % digitales"), usó voseo y llegó a contestar como Mandarina.

El 17-oct se leyeron completas 1.282 conversaciones de IND (jul–oct). Salieron tres cosas:

- Las ventas se pierden por **demora** (primeras respuestas de 5 a 11 h, fines de semana sin nadie). Ahí Indi suma.
- **Postventa** es lo más débil: guías, retrasos, "¿y mi pedido?".
- Los asesores se **contradecían** en abono, boceto, talla plus, gramaje y envío. Rodrigo fijó UNA regla por tema.

La meta de Rodrigo, con sus palabras: *"brindarle la información más actualizada para que pueda responder mejor"*.
Lo que más cambia es **precios y promos**, y lo actualizan Rodrigo y Xavier ("Andy" en los chats es Xavier).

## 2. Metas

1. **Un módulo de entrenamiento dentro del inbox IND** donde Rodrigo y Xavier mantienen al día lo que Indi sabe
   (precios, promos con fecha de fin, reglas, feriados) sin tocar código.
2. **Indi usa las respuestas rápidas que ya existen** como su base: manda las imágenes TAL CUAL (*"lo de las imágenes
   es de GRAN VALOR"*) y adapta el texto al tono del cliente.
3. **Indi sabe en qué va el pedido del cliente**: toma lo mismo que muestra la sección Ventas del inbox y lo dice en el
   lenguaje de la página pública "Sigue tu pedido".
4. **Indi calcula fechas concretas**: pago + 4 días laborables, sin sábados, domingos ni feriados.
5. **Los contactos internos no reciben nada automático**: ni saludo, ni flujos, ni Indi.
6. Indi queda **lista y probada**, con el texto viejo corregido.

## 3. No-metas

- **No prender a Indi con clientes.** Se sigue prendiendo chat por chat como hoy (la IA nace apagada; el cortafuegos por
  número `decidirIA` y `IA_AUTORESPUESTA` siguen mandando). Prenderla es una decisión aparte de Rodrigo.
- No es un panel para MANDI (mandi-agent). Si un día se porta, es otro proyecto.
- Indi no crea, edita ni cancela pedidos. Solo lee.
- No reemplaza las respuestas rápidas ni su editor actual; las reutiliza.
- No se arregla aquí el bloqueo de envíos de IND por el pago a Meta (17-oct).

## 4. Anti-metas (sería un fracaso aunque funcione)

- **Indi cambia una cifra**: un precio, un costo de envío, un tiempo, una dirección o un horario distinto del que está
  en la base o en la respuesta rápida. Puede reescribir el tono, nunca los números.
- **Indi inventa** lo que no está en la base (ej.: en la prueba del 17-oct dijo que la tela era "fresca por dentro"
  para la costa; eso no lo dijo nadie). Si no sabe, pasa a una persona.
- Indi le habla de ventas a la mamá, al taller o a un proveedor.
- Indi dice algo distinto de lo que muestra la página "Sigue tu pedido" sobre el mismo pedido.
- Un cambio en el módulo rompe a Indi sin que nadie se entere, o no se puede deshacer.
- Voseo, chilenismos, o hablar como Mandarina.

## 5. Reglas de negocio (fuente de verdad)

Las fijó Rodrigo el 17 y 18-oct-2026. Están completas, con el resto del conocimiento (marca, materiales, tiendas,
cómo vender, objeciones), en **`docs/indi/base-conocimiento-semilla.md`**: es lo primero que se carga en el módulo.

- Abono: personalizado < $100 pago completo; ≥ $100 50 %; el saldo al ver la foto de la prenda terminada, antes del envío.
- Boceto SIMPLE antes del pago (ubicación y tamaño); el arte del diseñador solo con pago.
- Precios personalizados (27-sep): hoodie $20 / 2+ $18 / 6+ $17 / 12+ $16 · con cierre $25/23/22/21 · camiseta
  $10/9/8/7 · incluye 1 estampado DTF de hasta 29 cm · 2XL–5XL +$2 por prenda, siempre.
- Estampados o bordados extra, volumen grande, descuentos fuera de tabla: los cotiza una persona.
- Envío personalizados: Quito $3,50 · resto del país $6. Colección gratis. Retiro gratis. Internacional por DHL, lo cotiza una persona.
- Hoodie premium **280 g**, fleece perchado 80/20 de Intela, sin cordones.
- Horario: Quito todos los días 10:30–6 pm · Ibarra L–S 10:30–7 pm, domingo cerrado. No mencionar Cumbayá/YAW.
- **Producción: 4 días laborables desde el pago, siempre, también en temporada.** Laborables = lunes a viernes que no
  sean feriado. Siempre como día concreto ("listo el miércoles 5").
- Tarjeta (link dLocal): sin recargo.

## 6. Cómo funciona (lo decidido)

### 6.1 Dónde vive lo que Indi sabe

Todo pasa a la base (Supabase `mandarina-DATA`, schema `inbox`, `cuenta='IND'`). `systemPrompt.js` se queda solo con
la **personalidad y las reglas de conducta** (tono, tuteo, cuándo callar, no cambiar cifras, no re-saludar); los
**datos** salen de la base en cada mensaje.

Indi lee en cada mensaje:

1. **Precios y promos** del módulo. Una promo con fecha de fin vencida no se lee.
2. **Reglas** del módulo (abono, boceto, envíos, horarios, producción…).
3. **Feriados** del módulo.
4. **Respuestas rápidas** activas de IND (`inbox.respuestas_rapidas`: texto, `imagenes[]`, grupo).
5. **Pedidos del cliente** (6.3).

**Un cambio vale desde el siguiente mensaje.** No hay aprobación: lo que se guarda, se usa. La seguridad la dan el
historial con deshacer, la caja de prueba y los campos validados (6.2).

### 6.2 El módulo de entrenamiento (inbox IND)

Una sección nueva del inbox (a la par de Respuestas, Flujos, etc.), con estas partes:

- **Precios y promos** — lo que más se toca. Campos con forma: los precios son números, una promo tiene título,
  texto, precio y **fecha de fin obligatoria**. Al vencer, Indi deja de ofrecerla sola.
- **Reglas** — las de la sección 5, cada una editable.
- **Feriados** — lista de feriados de Ecuador ya cargada (incluye los movidos por decreto que se conozcan); se edita
  solo cuando el gobierno mueve uno.
- **Preguntas fijas** — respuestas que Indi debe dar igual siempre y que hoy no están en ninguna respuesta rápida.
  Arranca con: link de Google Maps de cada tienda y "¿sirve para la costa?" (el texto lo da Rodrigo; hasta tenerlo,
  Indi pasa esa pregunta a una persona).
- **Historial** — cada cambio guarda quién, cuándo, antes y después, con botón **Deshacer**.
- **Probar a Indi** — una caja donde se escribe como cliente y se ve qué contestaría Indi con la base ACTUAL, sin
  mandar nada a WhatsApp. (Se puede apoyar en `indx-agent/api/playground.js`.)

**Quién edita:** "Andy" es Xavier (así saluda en los chats; Rodrigo, 18-oct), así que los que editan son Rodrigo y
Xavier. Regla: usuarios del CRM con rol **ADMIN** y **INDSTORE** en `tiendas` (hoy: AND "Andrés Admin" y XAV
"Xavier Castillo"); los demás ven el módulo pero no lo cambian. La identidad sale de la sesión firmada que ya usa el
inbox (`lib/sesion.js`, cookie del CRM, trae `{ id, rol }`), nunca de lo que diga el navegador.

### 6.3 Pedidos: lo mismo que la sección Ventas

Decisión de Rodrigo: *"en la sección ventas ya muestro el pedido.. por qué no lo toma de ahí?"*.

- La fuente es la **misma búsqueda de `app/api/cliente-pedidos/route.js`**: schema `crm` por los últimos 9 dígitos del
  teléfono (puente `cliente_conversacion` + `clientes.celular`) más el `idVenta` del chat. Indi no busca por su cuenta
  ni le pide el número de pedido al cliente si ya lo encuentra por el teléfono. La lógica se extrae a una función
  compartida para que Ventas e Indi no diverjan.
- Se le agregan dos cosas que Ventas no trae:
  1. **La etapa del cliente** (Recibido · Diseño · Producción · En camino · Entregado) con la MISMA regla del CRM
     (`MANDARINACRM/lib/etapaCliente.js`, `calcularEtapa`; necesita ítems, logs y guía). Si se copia al inbox, se
     marca como copia exacta como ya se hace con `lib/sesion.js`.
  2. **La guía**: número, transportista y foto (`crm.guias_despacho`, respaldo `pedidos.guia_numero`).
- **Fecha prometida = la `fecha_entrega_prometida` del pedido en el CRM** (la que llena el vendedor y con la que
  trabaja el Calendario del taller). Decisión de Rodrigo, 18-oct: así Indi dice lo mismo que el taller tiene anotado.
  **Para un pedido ya hecho, Indi usa SOLO esa fecha** (Rodrigo, 18-oct: "vamos a usar la fecha de 1"); no calcula
  otra. Si el pedido no tiene fecha prometida, Indi dice la etapa sin dar día y, si el cliente insiste en la fecha, pasa
  a una persona. Un pedido está **atrasado** cuando pasó esa fecha y todavía no está En camino.
- La regla "4 días laborables" queda solo para **cotizar antes de la compra** ("si pagas hoy, estaría listo el…").
- Indi dice: qué pedido, qué prendas, en qué etapa, y el día concreto. En camino → manda número y foto de la guía.
  Saldo pendiente → lo recuerda. Nunca dice montos de otros pedidos ni la dirección.
- **Solo pedidos de INDSTORE.** Ventas muestra de todas las tiendas; Indi filtra por la tienda de IND y, si el cliente
  pregunta por uno de otra tienda, pasa a una persona.
- **Pedido atrasado** (pasó la fecha prometida y no está En camino) → Indi **pide disculpas y pasa a una persona**.
  Nunca da una fecha nueva. (Decisión de Rodrigo, 18-oct.)

### 6.4 Respuestas rápidas como base

- Indi elige la respuesta rápida que corresponde y **manda sus imágenes exactamente como están guardadas**, en su orden.
- Puede adaptar el texto al tono del cliente, pero **nunca cambia cifras** (precios, costos, tiempos, direcciones, horarios).
- No re-saluda a media conversación (la bienvenida no se repite).
- Editar una respuesta rápida en el inbox vale desde el siguiente mensaje de Indi.
- Algunas respuestas no son para que Indi las use sola (ej. encuesta, cupón 10 %): se marcan **"no para Indi"** en el editor.

### 6.5 Cuándo Indi pasa a una persona

Usa el `escalar_a_soporte` que ya existe (`lib/escalar.js`: estado SOPORTE, modo HUMANO, sin avisarle al cliente que
es un traspaso). Casos: reclamos (no llega, prenda equivocada, cambio, devolución, reembolso, "estafa"), pedido
atrasado, pedido de otra tienda, estampados/bordados extra, volumen o B2B (más de ~20 prendas, RUC, colegios,
empresas), descuentos fuera de tabla, fechas límite duras, internacional, marcas registradas, audios que no entiende,
"quiero hablar con una persona", y **cualquier pregunta que la base no responda**.

**Fotos del cliente → al vendedor** (Rodrigo, 18-oct: "se deriva al vendedor"). Indi no mira ni comenta fotos: cuando el
cliente manda una (normalmente su diseño), el chat pasa a una persona. Hoy el webhook solo llama a Indi con texto
(`m.tipo === 'texto'`); el cambio es que una foto en un chat con Indi prendida dispare el traspaso, en vez de quedar
sin respuesta.

**⚠️ Hoy el traspaso NO funciona y va primero.** `escalar.js` hace el PATCH sin credencial; IND tiene
`AUTH_MODO=bloquear` desde el 8-ago y `/api/contactos/estado` no es ruta pública → 401. Indi le dice al cliente
"déjame revisar", pero el chat sigue en modo IA y nunca llega a SOPORTE. Se arregla con la credencial de máquina que
ya existe (`lib/auth-maquina.js`) y mirando `res.ok`: si el traspaso falla, Indi no puede seguir como si nada.

### 6.6 Contactos internos

- Se usa el botón **🏷️ Interno** que ya existe (`conversaciones.tipo_contacto='interno'`, en `components/App.jsx`).
  Los crons, la gestión y CAPI ya lo respetan; **el webhook no**: hoy el saludo, los flujos e Indi les llegan igual.
- `app/api/webhook/route.js` debe saltarse saludo, flujos e Indi cuando `tipo_contacto='interno'` o
  `sin_automaticos=true`. El mensaje se guarda y se ve en el inbox como siempre.
- **Hecho el 18-oct con el OK de Rodrigo:** 44 chats marcados como interno y una clienta que estaba mal marcada,
  devuelta a cliente. Quedan 2 dudosos sin marcar (los decide Rodrigo). La lista no va en este repo (tiene nombres de
  familia y empleados).

### 6.7 Arreglos antes de dar por lista a Indi

- Respuestas rápidas que contradicen las reglas: el horario de fin de semana dice 5 pm (es 6 pm); tres respuestas dicen
  "2 a 3 días" (es 4 días laborables); revisar la de "boceto sin compromiso" contra la regla del boceto simple. Se le
  muestran a Rodrigo antes de cambiarlas.
- Modelo de `indx-agent/api/agent.js`: `claude-sonnet-4-6` → el Sonnet actual.
- Confirmar que la cuenta de Anthropic tenga crédito (se quedó sin crédito en julio) y si `IA_AUTORESPUESTA` está en `on`.
- Dato al equipo: el gramaje es **280 g** (los asesores decían 320 y 420).

## 7. Restricciones

- Siempre en `main`, sin ramas. Español ecuatoriano con tuteo en commits, código y textos de la app.
- Base compartida con MANDI: migraciones una vez, registradas en `supabase_migrations.schema_migrations`.
- PostgREST corta en 1000 filas en silencio: paginar cualquier lectura que pueda crecer.
- Lecturas de Supabase en Next con `cache: 'no-store'`.
- `/api/webhook` es la ruta más llamada de IND: lo nuevo no debe hacerla lenta para todos los mensajes. Lo de Indi
  corre solo cuando Indi va a contestar.
- Nada se escribe en datos de producción (marcar internos, cambiar respuestas rápidas) sin el OK de Rodrigo.
- "Desplegado" se comprueba con `git status -sb` y el ID del despliegue, no con un deploy verde.

## 8. Decisiones que tomé yo (Rodrigo puede cambiarlas)

- La forma exacta de las tablas (ej. una tabla de conocimiento con tipo precio/promo/regla/pregunta, otra de historial,
  otra de feriados; una columna "no para Indi" en `respuestas_rapidas`).
- Que los datos del pedido los arme el inbox y se los pase a Indi junto con el mensaje, en vez de que `indx-agent` lea
  el schema `crm` por su cuenta.
- Que el permiso de editar sea "ADMIN con INDSTORE" y no una lista de usuarios con nombre.
- Que las "preguntas fijas" sean una parte del módulo y no respuestas rápidas nuevas.
- Que una pregunta sin respuesta en la base se pase a una persona en vez de que Indi improvise.
- **Precios de colección:** salen de Shopify (`buscar_productos`, lo que está a la venta hoy). El módulo cubre los
  personalizados y las promos; si una promo del módulo dice otro precio para un producto de colección, gana la promo
  mientras esté vigente.
- **Fecha al cotizar (antes de la compra):** el día del pago no cuenta; se cuentan 4 días laborables desde el
  siguiente (sin sábados, domingos ni feriados) y Indi dice el día en que queda **listo**, más "el envío toma 1 a 2 días"
  si es a provincia.
- **Lo no confirmado de la semilla** (oversize, camiseta 100 % algodón, precios históricos de extras, jacket $80 vs $50,
  número de seguidores) NO se carga para que Indi lo diga: se carga apagado y, hasta que Rodrigo lo confirme, Indi pasa
  esas preguntas a una persona.
- **Las respuestas rápidas también entran al historial con deshacer**, porque ahora son parte de lo que Indi sabe. El
  editor actual se queda igual; solo guarda el antes/después de cada cambio.
- **Links de Google Maps:** se sacan de las ubicaciones/respuestas que ya existen en el inbox; si no hay, los pide
  Rodrigo y mientras tanto Indi da la dirección escrita.

## 9. Lo que queda para quien lo construya

Diseño visual del módulo (respetando la paleta crema/negro de IND), estructura de tablas, cómo se arma el contexto para
el modelo y su tamaño, cómo `indx-agent` manda varias imágenes, las pruebas, y el orden de construcción.
