# HANDOFF 21-nov-2026 (IND) — UX del inbox, dashboard que dice la verdad; firma PENDIENTE

La sesión del 20 y 21-nov-2026 trabajó MANDI e IND a la vez. El detalle completo está en
`wa-inbox-next/docs/HANDOFF-2026-11-21-ux-firma-dashboard.md`. Acá va lo que corresponde a IND
(`ind-inbox-v2`) y en qué se diferencia de MANDI.

☠️ **Regla de Rodrigo:** *"nada de estos ajustes debe arriesgar la conexión con META ni perder
los mensajes o enviar mensajes de manera incorrecta"*. Antes de cada subida se probó que el diff
era solo de presentación: se quitan los cambios de estilo y el resto se compara con HEAD.

## Qué está EN PRODUCCIÓN (IND)
- **Bandeja** (`df06d0a`): RPC `inbox.aplicar_mensaje` (trampa #16 de la skill).
  ⚠️ No se vio todavía con un mensaje real de IND.
- **Buscador en respuestas rápidas** (`74f5e58`): busca también en el grupo 📦 Postventa
  (IND tiene 4 grupos; MANDI, 3).
- **Letra legible**, mínimo 11 px (`ee84c3c`). El 🧑/🤖 baja a la fila de chips. IND no tiene
  chip de canal en la fila.
- **Filtros plegados** también en la compu; plegados, se ven los activos (`9c24b18`, `8c624d0`).
- **Contraste** (`ddfd44e`):
  - El gris tenue `C.creamFaint #3A3530` daba 1.6:1.
  - El texto usa ahora `C.creamMuted #8a847b`, agregado a cada objeto `C`. Los bordes siguen
    con `creamFaint`.
  - Foco con teclado solo en botones y enlaces (`35b811d`).
  - Paleta crema/negro intacta: los toques de naranja Mandarina son solo de MANDI.
- **Reacciones** del cliente pegadas a nuestro mensaje (`abd6e1b`). `lib/reacciones.js` es
  idéntico en los dos repos.
- **Selector de etapa** en el encabezado (`bc83f30`).
  ⚠️ En IND `cambiarEtapa` y `datosGestion` reciben el TELÉFONO; en MANDI, la conversación.
- **Atendido → siguiente pendiente, J/K y 🎉 0 pendientes** (`b24f811`):
  - Los chats se abren con `irAResultadoBusqueda`, el mismo camino que un clic en la fila.
  - ☠️ De paso: `setLastSync` se marcaba aunque FALLARA la sincronización («Sync hh:mm» decía
    «al día» sin estarlo). Ahora solo se marca con respuesta del servidor, como en MANDI.
- **Dashboard** (`91617f7`): igual que MANDI. Los botones del final apuntan a los dominios
  propios.
- **«‹ Chats» en el celular** (`599da29`).
- **web-design-guidelines, tanda 1** (`e730f37`, `2193fb9`):
  - aviso pegado abajo;
  - Social sin bajar solo;
  - «➤» deshabilitado que se ve deshabilitado;
  - `overscroll-behavior` — ☠️ en `body *` rompió la rueda del mouse sobre filas y tarjetas;
    desde `9671a41` va SOLO en `.msgs-scroll` (el hilo);
  - `color-scheme: dark`;
  - fecha «20 Nov»;
  - la foto que carga te vuelve a bajar si estabas abajo.
- **web-design-guidelines, tanda 2: rendimiento** (`eb98952`, port de MANDI `5398a4c` +
  `1c23d78`). Por letra: **11 ms**. Filas, burbujas y pestañas ocultas (Contactos, Autos, INDI,
  Flujos) memorizadas; funciones por `ultimasRef`; ⏱ en `ContadorVentana`. Detalle y trampas
  en el handoff de MANDI.
- **Respuestas rápidas, buscador** (`cff51e3`, 22-nov): busca siempre en todos los grupos;
  tocar un grupo borra la búsqueda.
- **Scroll** (`9671a41`, 22-nov): mismo arreglo que MANDI. Probado en pantalla solo en MANDI.
- **Tanda 3** (22-nov), port de MANDI; el detalle y las trampas están en su handoff:
  - errores con el siguiente paso (`09dc61b`). Acá `/api/saliente` ya devolvía `code`, así que
    solo cambió el cliente;
  - Esc cierra ventanas (`4ba73c3`), probado en prod;
  - Contactos y carrusel no dibujan lo que está fuera de pantalla (`ccd8499` + `e8d31a6`):
    las 400 filas miden 61 px en prod;
  - «…» (`4b9fece`).

## PENDIENTE (IND)
- **Firma del webhook: SOLO OBSERVA.** Los registros dicen `[firma] sin-secreto`: falta
  `META_APP_SECRET` en Vercel (`ind-inbox-v2`). Rodrigo lo saca el 21-nov. Pasos:
  1. Cargar el secreto en Vercel, pegándolo en la web y no desde PowerShell (pega un BOM invisible).
  2. Redesplegar.
  3. Comprobar en los registros que todo sale `coincide`.
  4. Recién entonces cerrar la firma como MANDI (`b0e97d6`): `descartarSinFirma` con
     NO-coincide y sin-secreto, y su prueba.
  - ⚠️ Si es la misma app de Meta que MANDI, el valor es el mismo. Si no, no: el nombre de la
    variable es igual, el valor no tiene por qué serlo.
- **Revisar en el celular:** pestañas, selector de etapa, «‹ Chats».
- **Probar con un cliente real:** Atendido → siguiente; la bandeja nueva.
- **web-design-guidelines, tanda 3:** HECHA (ver arriba). Rodrigo descartó «nombres para
  lectores de pantalla» y `prefers-reduced-motion`.
