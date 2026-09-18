# HANDOFF · 18-sep-2026 · Reenviar mensajes a otro chat (IND)

Mismo cambio que MANDI, mismo día. El detalle completo (incluida la verificación de qué permite y qué
no permite la Cloud API de Meta) está en `wa-inbox-next/docs/HANDOFF-2026-09-18-reenviar-mensajes.md`.

**Qué es:** cada mensaje del chat tiene un botón **↪** al costado de la burbuja. Abre un buscador de
conversaciones y manda ese mismo contenido a la que elijas. Tocar la burbuja sigue mostrando
"↩ Responder", como antes.

## Lo que hay que saber

- **Meta no permite editar ni borrar** un mensaje ya enviado por la API, y tampoco existe "reenviar":
  reenviar es mandar el mismo contenido como mensaje nuevo. Por eso no lleva ningún prefijo.
- **Editar y borrar sí llegan del cliente** (coexistencia): IND recibió 242 ediciones y 112 borrados
  en 60 días. El inbox los muestra como una fila aparte y **no** actualiza el mensaje original. Queda
  pendiente aplicarlos.
- **Un medio sin `mediaUrl` no se reenvía**: todavía no está archivado y su `mediaId` es de nuestro número.
- **El envío sale por el canal del chat DESTINO** (3326 o 9804, según a quién le escribas).
- **Ventana de 24 h por destino**: los chats cerrados aparecen deshabilitados, con el motivo.

## Dónde vive

| pieza | archivo |
|---|---|
| Decisión pura + pruebas (idénticas a MANDI) | `lib/reenvio.js` · `tests/reenvio.test.js` |
| Botón ↪ | `components/Components.jsx` (`MessageBubble`) |
| Buscador y envío | `components/App.jsx` (`confirmarReenvio`) |
| Envío | `reenviarPieza` en `lib/api-client.js` |

## Estado

- 629 pruebas en verde y `next build` limpio. Commit `81426b9`.
- ⏳ Falta probarlo en vivo.
