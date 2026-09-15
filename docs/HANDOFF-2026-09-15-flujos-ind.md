# HANDOFF · 15-sep-2026 · FLUJOS en IND (puerto desde MANDI, Fase A + B)

**Qué es:** la pestaña **🧭 FLUJOS** del inbox de IND. Es el mismo lienzo de nodos y el mismo motor que
MANDI: Disparador, Mensajes, Condición y Fin, con botones, esperas en las líneas y estado por cliente.
Diseño: `wa-inbox-next/docs/superpowers/specs/2026-09-15-flujos-lienzo-design.md`. Handoff del
motor: `wa-inbox-next/docs/HANDOFF-2026-09-15-flujos-fase-b.md`.

## Estado al cerrar

| pieza | estado |
|---|---|
| Tablas `inbox.flujos`, `flujo_estado`, `flujo_pasos` | ya existían (la base es una sola, separada por `cuenta`). **Sin migración** |
| Pruebas (600) + lint + `next build` | ✅ verde |
| Flujos publicados en IND | 0. Con 0 flujos, nada nuevo corre en producción |
| Prueba real con un número | ⏳ pendiente |

## Diferencias con MANDI (a propósito)

- **Sin recetas.** IND nunca tuvo "recetas de bienvenida". No existen `importarRecetas`, la ruta
  `/api/flujos/importar-recetas` ni el botón "Importar". `lib/recetas.js` sí se copió
  entero, porque el motor usa sus botones, piezas y `esc`.
- **Webhook síncrono.** En IND el loop del webhook es el camino del 200 a Meta, así que los flujos corren
  **en background y EN COLA POR CLIENTE** (`colasAutomaticos`). Así un segundo mensaje del mismo cliente
  encuentra el estado que dejó el primero. El saludo automático entra en la misma cola, porque un flujo
  lo reemplaza.
- **Caché de 30 s** de flujos publicados por instancia (`flujosPublicadosCache`). IND es la ruta con más
  invocaciones: sin caché, cada texto costaría una lectura. **Publicar o despublicar tarda hasta 30 s
  en notarse en el webhook.**
- **Ecos del celular:** borran el estado del flujo **solo si hay flujos publicados**, para no hacer un
  `delete` por cada eco del 9804.
- **"El bot tomó el chat"** se decide con `agenteResponde` (master switch `IA_AUTORESPUESTA` +
  cortafuegos + chat), no con `modoIA` solo.
- **Envíos internos** por `enviarConMaquina`, la credencial de máquina. El cron hace lo mismo.
- **`/api/anuncios` solo GET.** Lee `inbox.anuncios_resumen('IND')`, que devolvió 39 anuncios al portar.
- **El webhook ahora declara `maxDuration = 60`**, igual que MANDI: una tanda con fotos tarda.

## Pausas en segundos en las líneas (15-sep, tarde)

Mismo cambio que MANDI (ver su `docs/HANDOFF-2026-09-15-flujos-fase-b.md`): la cajita de la línea acepta
**segundos** (`esperaSeg`, tope 20 s por línea y 30 s por tanda) que se esperan entre piezas sin detener el
flujo. Por eso la cola del webhook pasó de **una por lote a una por cliente**: con pausas, la tanda de un
cliente atrasaba el saludo o el flujo de otro. El cron procesa los vencidos en paralelo, de a 20.


| pieza | archivo |
|---|---|
| Idénticos a MANDI | `lib/flujo.js`, `lib/flujo-motor.js`, `lib/recetas.js`, `components/flujos/{nodos,PanelEdicion}.jsx`, `grafo-reactflow.js`, `app/api/flujos/{,publicar,pasos}/route.js`, sus pruebas |
| Adaptados | `lib/flujos.js` (sin recetas) · `components/flujos/Flujos.jsx` (sin importar) · `app/api/cron/flujos/route.js` (`enviarConMaquina`) · `app/api/anuncios/route.js` (solo GET) |
| Datos | final de `lib/inbox-supabase.js` · `marcarReceta` y `getAnunciosResumen` en `lib/contactos.js` |
| Webhook | `app/api/webhook/route.js` → `flujosPublicadosCache`, bloque FLUJOS, `automaticosDe`, `procesarEchoes` |
| Contestar a mano cancela | `app/api/saliente/route.js` (bloque `if (!body.auto)`) |
| Pestaña | `components/App.jsx` (`vista === 'FLUJOS'`, `next/dynamic`) |
| Interruptor general | `DEFAULTS.flujos` en `lib/automatizaciones.js` + tarjeta 🧭 en AUTOS |
| Cron cada 5 min | `vercel.json` + `lib/rutas-publicas.js` + matcher de `middleware.js` |

## Controles

```sql
select nombre, publicado, actualizado_at from inbox.flujos where cuenta='IND' order by actualizado_at desc;
select telefono, nodo_id, esperando, vence_at from inbox.flujo_estado where cuenta='IND';
select config->'flujos' from inbox.automatizaciones where cuenta='IND';
```
Sin clave, `curl https://ind-inbox.apps.mandarinaec.com/api/cron/flujos` debe dar `{"error":"no autorizado"}`.
Si da `sin-sesion`, el candado lo atrapó.

## Prueba real (pendiente)

Es la misma que MANDI (ver el handoff B), con el flujo "PRUEBA B" y la palabra `pruebaflujo`, en IND.
Ojo con el **número**: el flujo contesta por el mismo número al que escribió el cliente (3326 o 9804).

## Pendiente

- Prueba real en IND.
- La pestaña FLUJOS usa la paleta oscura de MANDI, no la crema/negro de IND. Funciona; es solo visual.
- `tests/rutas-publicas.test.js` cuenta 38 rutas listadas y el repo tiene 40 `route.js`. Es un hueco anterior
  (`/api/cron/pagos` no está en `PUBLICAS` de la prueba, más `rescatar-media`); no lo abrió este porte.
