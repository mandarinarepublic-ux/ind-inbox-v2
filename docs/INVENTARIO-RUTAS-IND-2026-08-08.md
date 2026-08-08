# Inventario de rutas del inbox de IND — 8-ago-2026

Insumo obligatorio del candado (Fase 5). **La lista sale de medir, no de recordar.**
Cuando el inventario y la memoria no coincidan, gana el inventario.

## Cómo se armó

- Rutas reales del repo: `find app/api -name route.js` → **28 rutas**.
- Tráfico de producción agrupado por ruta, proyecto `ind-inbox-v2`, entorno production.
- Comparación contra el inventario de MANDI del 7-ago.

> ⚠️ **La ventana efectiva fue de 3 DÍAS, no 7.** La consulta de 7 días agotó el
> tiempo dos veces. Alcanza para lo de uso diario; **no** garantiza ver algo que
> corra semanal o mensualmente. Por eso el modo observación no es opcional.
>
> Y ojo con el punto ciego que ya nos mordió hoy: **un registro vacío por tiempo
> agotado se lee igual que un cero real.** Si una consulta se cae, decirlo, no
> tratarlo como ausencia de tráfico.

## 🔓 PÚBLICAS — nunca pueden pedir sesión (2)

Van excluidas en el `matcher`, no en una lista dentro del código.

| Ruta | Llamador | Cómo se defiende | 3 días |
|---|---|---|---|
| `/api/webhook` | Meta (WhatsApp) | firma `META_APP_SECRET` | **7.880** |
| `/api/cron/seguimientos` | cron de Vercel | `CRON_SECRET` | 3 |

**Son la mitad que en MANDI**, que tenía cuatro: IND **no tiene** SOCIAL
(`/api/social/*`) ni dLocal (`/api/pago-dlocal`). Menos superficie que cerrar.

## 👤 DEL NAVEGADOR — se protegen con la sesión

Con tráfico medido: `inbox-sync` (5.220) · `saliente` (1.900) · `hilo` (532) ·
`cliente-pedidos` (524) · `contactos/estado` (402) · `media` (394) ·
`media/precache` (302) · `mensaje` (103) · `respuestas` (11) · `upload-foto` (6) ·
`upload-media` (6) · `tienda` (2) · `notas` (1).

Más las páginas `/` (55) e `/inbox` (12), y `manifest.webmanifest` (24).

## 🚪 SIN TRÁFICO EN LA VENTANA (13)

`automatizaciones` · `buscar` · `capi/diag` · `contactos` · `conversacion` ·
`dashboard` · `directorio` · `lista` · `mensajes` · `plantillas` ·
`push/subscribe` · `push/test` · `upload-url`

No significa que nadie las use: significa que **nadie las usó en 3 días**.
Van protegidas como todo lo del navegador; el modo observación dirá si alguna
tiene un llamador que no vimos.

## Diferencias de IND respecto de MANDI

| | MANDI | IND |
|---|---|---|
| Rutas totales | 35 | 28 |
| Públicas | 4 | **2** |
| SOCIAL (FB/IG) | sí | no |
| dLocal | sí | no |
| Subir archivos | `media/upload` | `upload-media` |

## ⚠️ Lo que hace a IND distinto de MANDI, y manda sobre el plan

En MANDI la ventana de observación se corrió **40 minutos** porque Rodrigo
confirmó ser el único que atiende ese inbox. **Acá no aplica**: IND tiene
**1.900 envíos en 3 días** hechos por personas. Hay que correr la ventana
completa.

Permisos al 8-ago: `INBOX_INDSTORE` lo tienen **Andrés Admin** y **Xavier
Castillo**, los dos activos. Rodrigo confirmó que es correcto. Si quien hace esos
envíos no entra con una de esas dos cuentas, el bloqueo lo deja fuera.

☠️ **INSTRUCCIÓN DIRECTA DE RODRIGO: avisarle ANTES de encender el bloqueo**,
para que cierre sesión y vuelva a entrar. Viene de MANDI, donde se encendió con
su navegador sin sesión puesta y se perdieron 3 salientes con 401 silenciosos.
