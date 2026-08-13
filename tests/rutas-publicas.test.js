// La lista de rutas públicas es lo más delicado de todo el candado: una de menos
// y dejas de recibir mensajes de Meta. Estas pruebas son el inventario MEDIDO del
// 8-ago-2026 convertido en red de seguridad, más `/api/cron/pendientes` sumada el
// 13-ago-2026 al portar el recordatorio de Telegram desde MANDI.
//
// Van las 30 rutas REALES del repo (`find app/api -name route.js`), una por una,
// más las páginas. Si alguien agrega una ruta y no la pone acá, la prueba no
// falla — por eso al final se comprueba también que la lista de públicas sea
// EXACTAMENTE de tres, que es la parte que sí puede hacer daño.
//
// ⚠️ `/api/admin/meta-waba` faltaba en este inventario (hueco anterior al
// 13-ago-2026, no introducido por el port de Telegram): no exponía nada —el
// matcher de middleware.js la cubre igual, candado puesto por defecto— pero sí
// dejaba a esta prueba contando 29 cuando el repo ya tenía 30. Sumada a
// PROTEGIDAS acá abajo.
import test from 'node:test'
import assert from 'node:assert'
import { esRutaPublica, RUTAS_PUBLICAS } from '../lib/rutas-publicas.js'

// Las 3 que NUNCA pueden pedir sesión. Cada una se defiende sola.
// Son MENOS que en MANDI: IND no tiene SOCIAL ni dLocal.
const PUBLICAS = [
  '/api/webhook',            // Meta (WhatsApp) — 7.880 llamadas en 3 días
  '/api/cron/seguimientos',  // cron de Vercel — 3 llamadas en 3 días
  '/api/cron/pendientes',    // cron de Vercel, cada 5 min — recordatorio Telegram
]

// Las otras 27 rutas del repo: todas son del navegador y van protegidas.
const PROTEGIDAS = [
  '/api/admin/meta-waba', '/api/automatizaciones', '/api/buscar', '/api/capi/diag',
  '/api/cliente-pedidos', '/api/contactos', '/api/contactos/estado', '/api/conversacion',
  '/api/dashboard', '/api/directorio', '/api/hilo', '/api/inbox-sync', '/api/lista',
  '/api/media', '/api/media/precache', '/api/mensaje', '/api/mensajes', '/api/notas',
  '/api/plantillas', '/api/push/subscribe', '/api/push/test', '/api/respuestas',
  '/api/saliente', '/api/tienda', '/api/upload-foto', '/api/upload-media',
  '/api/upload-url',
  // Las páginas
  '/', '/inbox', '/dashboard',
]

test('las 30 rutas del repo están cubiertas por esta prueba', () => {
  // 3 públicas + 27 protegidas = las 30 que devuelve `find app/api -name route.js`.
  // Si mañana alguien agrega una ruta nueva y no la suma acá, este número canta.
  assert.strictEqual(PUBLICAS.length + (PROTEGIDAS.length - 3), 30)
})

for (const ruta of PUBLICAS) {
  test(`PÚBLICA: ${ruta}`, () => {
    assert.strictEqual(esRutaPublica(ruta), true, `${ruta} tiene que quedar abierta`)
  })
}

for (const ruta of PROTEGIDAS) {
  test(`PROTEGIDA: ${ruta}`, () => {
    assert.strictEqual(esRutaPublica(ruta), false, `${ruta} NO puede quedar abierta`)
  })
}

test('las públicas son EXACTAMENTE tres', () => {
  // Cada entrada de más es una puerta al internet entero. Que agregar una rompa
  // una prueba es justamente lo que se busca.
  assert.deepStrictEqual(RUTAS_PUBLICAS, ['/api/webhook', '/api/cron/seguimientos', '/api/cron/pendientes'])
})

test('no se coló nada de MANDI que en IND ni existe', () => {
  // Copiar la lista de MANDI de memoria abriría rutas inexistentes hoy… y las
  // dejaría abiertas el día que se creen.
  assert.strictEqual(esRutaPublica('/api/social/webhook'), false)
  assert.strictEqual(esRutaPublica('/api/pago-dlocal'), false)
})

test('el prefijo no alcanza para colarse', () => {
  // /api/webhook-falso NO es /api/webhook. Si se compara con startsWith a secas,
  // cualquiera abre una puerta agregándole texto al final.
  assert.strictEqual(esRutaPublica('/api/webhook-falso'), false)
  assert.strictEqual(esRutaPublica('/api/webhookeria'), false)
})

test('las subrutas de una pública SÍ son públicas', () => {
  // Meta puede llamar con subruta; el cron también.
  assert.strictEqual(esRutaPublica('/api/webhook/'), true)
  assert.strictEqual(esRutaPublica('/api/cron/seguimientos'), true)
})

test('la barra final no cambia la decisión', () => {
  assert.strictEqual(esRutaPublica('/api/hilo/'), false)
})

test('basura y vacío no son públicos', () => {
  assert.strictEqual(esRutaPublica(''), false)
  assert.strictEqual(esRutaPublica(null), false)
  assert.strictEqual(esRutaPublica(undefined), false)
})
