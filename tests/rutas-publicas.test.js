// La lista de rutas públicas es lo más delicado de todo el candado: una de menos
// y dejas de recibir mensajes de Meta. Estas pruebas son el inventario MEDIDO del
// 8-ago-2026 convertido en red de seguridad, más `/api/cron/pendientes` sumada el
// 13-ago-2026 al portar el recordatorio de Telegram desde MANDI, más
// `/api/linkpago` y `/api/pago-dlocal` sumadas el 15-ago-2026 al portar LINK PAGO
// (decisión explícita del dueño: IND reutiliza la cuenta dLocal de MANDI, ver
// lib/dlocal.js).
//
// Van las 33 rutas REALES del repo (`find app/api -name route.js`), una por una,
// más las páginas. Si alguien agrega una ruta y no la pone acá, la prueba no
// falla — por eso al final se comprueba también que la lista de públicas sea
// EXACTAMENTE de cuatro, que es la parte que sí puede hacer daño.
//
// ⚠️ `/api/admin/meta-waba` faltaba en este inventario (hueco anterior al
// 13-ago-2026, no introducido por el port de Telegram): no exponía nada —el
// matcher de middleware.js la cubre igual, candado puesto por defecto— pero sí
// dejaba a esta prueba contando 29 cuando el repo ya tenía 30. Sumada a
// PROTEGIDAS acá abajo.
//
// ⚠️ El número de rutas de este archivo se rompió una vez por estar escrito a
// mano y no recontado tras un cambio (ver el aviso de `/api/admin/meta-waba`
// arriba). Al sumar LINK PAGO el 15-ago-2026 se corrió `find app/api -name
// route.js` de nuevo en vez de sumar "+2" de memoria — dio 33, y es lo que
// queda escrito abajo.
import test from 'node:test'
import assert from 'node:assert'
import { esRutaPublica, RUTAS_PUBLICAS } from '../lib/rutas-publicas.js'

// Las 4 que NUNCA pueden pedir sesión. Cada una se defiende sola.
//
// Son MENOS que en MANDI: IND sigue sin SOCIAL. `/api/pago-dlocal` SÍ se sumó
// acá el 15-ago-2026 — ver el aviso grande más abajo, en el test que antes
// comprobaba lo contrario.
const PUBLICAS = [
  '/api/webhook',            // Meta (WhatsApp) — 7.880 llamadas en 3 días
  '/api/cron/seguimientos',  // cron de Vercel — 3 llamadas en 3 días
  '/api/cron/pendientes',    // cron de Vercel, cada 5 min — recordatorio Telegram
  '/api/cron/entregas',      // cron de Vercel, cada 30 min — aviso de entregas fallidas
  '/api/pago-dlocal',        // dLocal Go, notification_url — secreto en la URL
]

// Las otras 28 rutas del repo: todas son del navegador y van protegidas.
const PROTEGIDAS = [
  '/api/admin/meta-waba', '/api/automatizaciones', '/api/buscar', '/api/capi/diag',
  '/api/cliente-pedidos', '/api/contactos', '/api/contactos/estado', '/api/conversacion',
  '/api/dashboard', '/api/directorio', '/api/hilo', '/api/inbox-sync', '/api/linkpago',
  '/api/lista', '/api/media', '/api/media/precache', '/api/mensaje', '/api/mensajes',
  '/api/notas', '/api/plantillas', '/api/push/subscribe', '/api/push/test',
  '/api/respuestas', '/api/saliente', '/api/tienda', '/api/upload-foto',
  '/api/upload-media', '/api/upload-url',
  // Las páginas
  '/', '/inbox', '/dashboard',
]

test('las 33 rutas del repo están cubiertas por esta prueba', () => {
  // 5 públicas + 28 protegidas = las 33 que devuelve `find app/api -name route.js`.
  // Si mañana alguien agrega una ruta nueva y no la suma acá, este número canta.
  assert.strictEqual(PUBLICAS.length + (PROTEGIDAS.length - 3), 33)
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

test('las públicas son EXACTAMENTE cinco', () => {
  // Cada entrada de más es una puerta al internet entero. Que agregar una rompa
  // una prueba es justamente lo que se busca.
  assert.deepStrictEqual(RUTAS_PUBLICAS, [
    '/api/webhook', '/api/cron/seguimientos', '/api/cron/pendientes',
    '/api/cron/entregas', '/api/pago-dlocal',
  ])
})

// ⚠️ ESTE TEST SE INVIRTIÓ A PROPÓSITO EL 15-AGO-2026.
//
// Hasta ese día decía "IND no tiene SOCIAL ni dLocal" y afirmaba que
// `/api/pago-dlocal` NO podía ser pública — y tenía razón: la ruta ni existía.
// Un implementador anterior leyó esa afirmación, la verificó contra el código,
// confirmó que era cierta, y se negó a portar LINK PAGO sobre un supuesto falso
// ("IND ya tiene lib/dlocal.js"). Hizo bien en parar.
//
// El dueño después SÍ decidió explícitamente traer LINK PAGO a IND,
// reutilizando la cuenta dLocal de MANDI (ver lib/dlocal.js — el `description`
// que manda a dLocal es "Pago IND STORE", distinto del de MANDI, justamente
// para poder separar los dos negocios dentro de la misma cuenta compartida).
// Por eso `/api/pago-dlocal` pasa a ser pública EN SERIO, no por accidente:
// dLocal llama a esa ruta desde el internet y se defiende con un secreto
// compartido en la URL, no con sesión.
//
// SOCIAL sigue sin existir en IND — esa mitad del test viejo sigue en pie.
test('dLocal se sumó a propósito el 15-ago-2026; SOCIAL sigue sin existir', () => {
  assert.strictEqual(esRutaPublica('/api/social/webhook'), false)
  assert.strictEqual(esRutaPublica('/api/pago-dlocal'), true)
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

// ⚠️ ESTO PASÓ DE VERDAD, en MANDI, el 21-ago. `/api/cron/entregas` —el aviso de
// mensajes que NO le llegaron al cliente— se desplegó sin estar en el `matcher`
// del middleware. Vercel lo llamaba, el middleware lo mandaba al login, y la
// tarea no corría NUNCA: sin error, sin registro, sin nada. Un aviso construido
// para romper un silencio, muerto en el mismo silencio.
//
// Estas dos pruebas leen `vercel.json` y exigen que TODO cron programado esté
// fuera del candado, en las DOS capas. Un cron nuevo que se olvide de la lista
// rompe acá, no en producción tres semanas después.
import { readFileSync } from 'node:fs'

test('todo cron de vercel.json queda fuera del candado', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const crons = (vercel.crons || []).map(c => c.path)
  assert.ok(crons.length > 0, 'vercel.json debería tener crons')
  for (const ruta of crons) {
    assert.ok(esRutaPublica(ruta),
      `${ruta} está programado como cron pero el candado lo bloquea: agrégalo a RUTAS_PUBLICAS y al matcher de middleware.js`)
  }
})

test('y el matcher del middleware también los excluye', () => {
  // La lista de rutas públicas es la SEGUNDA capa. Si el `matcher` no los excluye,
  // el middleware corre igual y redirige antes de que nadie mire la lista.
  const mw = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

  // ⚠️ Se mira SOLO el patrón del matcher, no el archivo entero. Un `includes`
  // sobre todo el archivo pasa por cualquier COMENTARIO que nombre la ruta — y
  // este archivo está lleno de comentarios que las nombran. Una prueba que no se
  // cae cuando el bug está presente es peor que no tener prueba: da permiso para
  // no mirar. Verificado quitando la ruta del matcher a propósito.
  const desde = mw.indexOf("(?!")
  const hasta = mw.indexOf(")", desde)
  assert.ok(desde > 0 && hasta > desde, "no se pudo leer el patrón del matcher de middleware.js")
  const excluidasDelMatcher = mw.slice(desde + 3, hasta).split("|").map(s => s.trim())

  for (const ruta of (vercel.crons || []).map(c => c.path)) {
    const sinBarra = ruta.slice(1)
    assert.ok(excluidasDelMatcher.includes(sinBarra),
      `${ruta} no está excluido en el matcher de middleware.js: el cron se va a redirigir al login y no correrá nunca`)
  }
})
