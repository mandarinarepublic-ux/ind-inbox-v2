# HANDOFF · 13-sep-2026 · Seguimiento por temperatura + Encuesta de reactivación

Porte desde MANDI de la sección 🌡️ de AUTOMATIZACIONES, con dos cosas que MANDI
no tiene: **botones de respuesta** en cada regla y la **ENCUESTA DE REACTIVACIÓN**
con su propia bandeja.

---

## Lo que se destapó antes de portar (y por qué importa)

**1. Todo chat nuevo nacía con la IA PRENDIDA, en los dos inbox.** Medido en 14
días: MANDI 406 de 406, IND 1.048 de 1.055. El webhook guarda el mensaje ANTES de
registrar el contacto; `getConvId` crea la fila solo con `cuenta + telefono` y la
columna `modo_ia` tenía default `'IA'`. Cuando llega `registrarContactoEntrante`
(que sí pone HUMANO) la fila ya existe y no la toca.

→ **Migración `conversaciones_modo_ia_default_humano`**: default `'HUMANO'`.
Arregla los dos inbox sin tocar el webhook. Los chats ya nacidos en IA **no se
tocaron** (no se distingue uno nacido mal de uno prendido a propósito).

**2. El cron de IND nunca mandó nada** (cero `ultimo_seguimiento_at` en la base):
corría **una vez al día a las 9 am** y miraba el modo del CHAT (siempre IA por el
punto 1). Ahora corre **cada hora** y decide por el cortafuegos del NÚMERO + el
chat (`decidirIA`), igual que el webhook.

**3. En MANDI tampoco mandó nunca uno**, pero por otra causa: su cron llama a
`/api/saliente` **sin la credencial de máquina** y esa ruta no es pública → 401
desde que se prendió el candado el 7-ago. El cron responde 200 cada hora.
**PENDIENTE en MANDI** (no se tocó en esta sesión): usar `cabecerasMaquina()` o
el equivalente y guardar `status` en los errores.

---

## Cómo queda

| pieza | archivo |
|---|---|
| Reglas, textos y botones (defaults) | `lib/automatizaciones.js` → `DEFAULTS.seguimientos` |
| ¿A quién, cuándo, cuál mensaje? (puro, probado) | `lib/decidir-seguimiento.js` |
| ¿Lo maneja el bot o mando yo? (puro) | `lib/camino-seguimiento.js` |
| Cuerpo para `/api/saliente`, con o sin botones (puro) | `lib/seguimiento-envio.js` |
| El cron (solo recorre y envía) | `app/api/cron/seguimientos/route.js` · `vercel.json` `0 * * * *` |
| Pantalla | `components/Automatizaciones.jsx` (tarjeta 🌡️) |
| Bandeja 📋 ENCUESTA | `components/App.jsx` (filtro + botón de estado) · `components/Components.jsx` |

**Reglas de la decisión** (`decidirSeguimiento`), en orden:
1. Interruptor global prendido · chat no archivado · sin `id_venta` · el bot NO va
   a contestar ese chat (`caminoDeSeguimiento` = cortafuegos del número + modo del chat).
2. Ventana de 24 h ABIERTA (desde el último mensaje del cliente).
3. Máximo UN automático por ventana (`ultimo_seguimiento_at > ultimo_entrante_at` → nada).
4. **Temperatura** (🔥🌤️❄️): si el chat tiene una y la regla está viva, dispara a
   las `horas` de silencio del cliente.
5. **Encuesta**: si no salió una temperatura, el chat está en **ATENDIDO** y el
   último mensaje es **mío** (`ultimo_mensaje_at > ultimo_entrante_at`), dispara a
   las `horas` de mi último mensaje. Al enviarse, el chat pasa a la bandeja
   **ENCUESTA** (`updateEstado(tel, 'ENCUESTA', phoneId)`).

**Botones**: hasta 3, títulos de 20 letras (límite de WhatsApp). Con botones el
mensaje sale como `TipoMensaje: 'interactive_buttons'`, que `/api/saliente` ya
sabía mandar (es lo que usan las RESPUESTAS RÁPIDAS). La respuesta del cliente
entra al chat como texto (`wa-mensaje.js` ya leía `interactive.button_reply`) y
**lo devuelve a PENDIENTES** como cualquier entrante. **Ningún botón dispara nada
solo** — decisión del dueño, 13-sep.

**No se portó** el camino `despertar` de MANDI (pedirle al agente que retome él
la conversación): indx-agent no entiende el origen `seguimiento`. Con el bot
activo en ese chat, el cron lo deja en paz.

---

## Trampas que dejó esta sesión

- ☠️ `inbox.mensajes.direccion` va en **MAYÚSCULAS** (`ENTRANTE`/`SALIENTE`).
  Una consulta con minúsculas devuelve ceros sin quejarse.
- El merge de `/api/automatizaciones` es de UN nivel: un interruptor por regla
  manda el bloque de esa regla **completo** (`togSegT`), si no borra horas, texto
  y botones.
- `getContactos(null)` = todos los números. El envío sale por `c.phoneId`.
- Con el cron cada hora, una regla a las 23 h tiene UNA oportunidad por ventana.
  Si se quiere más margen, bajar las horas, no subir la frecuencia.

---

## Cómo probar en vivo (no se hizo en esta sesión: requiere un chat real)

1. En AUTOS, prender 🌡️ y la regla 🔥 con `horas = 1` y un botón.
2. Escribir al 3326 o al 9804 desde tu celular; marcar tu chat 🔥 en el inbox y
   NO responderte (el chat queda PENDIENTE; la temperatura no depende del estado).
3. Esperar a la siguiente hora en punto. Debe llegar el mensaje con el botón, y
   `ultimo_seguimiento_at` de tu conversación debe quedar con esa hora.
4. Para la encuesta: contéstate desde el inbox (el chat pasa a ATENDIDO), pon
   `horas = 1` en 📋, espera la hora en punto: llega la encuesta y tu chat aparece
   en la bandeja 📋 Encuesta. Toca un botón → el chat vuelve a PENDIENTES con el
   título del botón como texto.
5. Dejar las horas en su valor real al terminar.

Consulta de control (lo que el cron hizo, sin abrir logs):
```sql
select telefono, estado, temperatura, ultimo_entrante_at, ultimo_seguimiento_at
from inbox.conversaciones where cuenta='IND' and ultimo_seguimiento_at is not null
order by ultimo_seguimiento_at desc limit 20;
```
