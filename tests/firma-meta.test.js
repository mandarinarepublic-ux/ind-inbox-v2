// La firma de Meta. Hoy solo se OBSERVA, pero estas pruebas son la condición
// para que algún día se pueda activar: si el cálculo estuviera mal y algún día
// esto rechazara, el inbox dejaría de recibir mensajes de clientes.
import test from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { evaluarFirmaMeta, observarFirmaMeta } from '../lib/firma-meta.js'

const SECRETO = 'app-secret-de-prueba'
const CUERPO = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}'
const firmaDe = (cuerpo, sec = SECRETO) =>
  'sha256=' + createHmac('sha256', sec).update(cuerpo, 'utf8').digest('hex')

test('una firma bien hecha coincide', () => {
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: SECRETO, crudo: CUERPO, cabecera: firmaDe(CUERPO) }),
    'coincide',
  )
})

test('el cuerpo alterado NO coincide', () => {
  // El caso que da sentido a todo: alguien manda un mensaje inventado.
  const otro = CUERPO.replace('"1"', '"999"')
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: SECRETO, crudo: otro, cabecera: firmaDe(CUERPO) }),
    'NO-coincide',
  )
})

test('con OTRO secreto NO coincide', () => {
  // Es el caso real de tener el App Secret de otra app de Meta.
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: 'otro-secreto', crudo: CUERPO, cabecera: firmaDe(CUERPO) }),
    'NO-coincide',
  )
})

test('un cuerpo re-serializado NO coincide — por eso hace falta el crudo', () => {
  // Parsear y volver a serializar cambia espacios y orden de claves. El mensaje
  // sería legítimo y la firma fallaría igual. Es la trampa que rompería todo.
  //
  // Ojo: este cuerpo lleva espacios A PROPÓSITO. Con un JSON ya compacto,
  // volver a serializarlo devuelve la misma cadena y la prueba no probaría nada
  // — me pasó al escribirla.
  const conEspacios = '{"object": "whatsapp_business_account", "entry": [{"id": "1"}]}'
  const reserializado = JSON.stringify(JSON.parse(conEspacios))
  assert.notStrictEqual(reserializado, conEspacios)
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: SECRETO, crudo: reserializado, cabecera: firmaDe(conEspacios) }),
    'NO-coincide',
  )
})

test('el BOM del secreto no rompe la comprobación', () => {
  // Cargar variables a Vercel desde PowerShell les pega un BOM invisible, y eso
  // ya mordió en este proyecto: falla SOLO en producción.
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: '﻿' + SECRETO, crudo: CUERPO, cabecera: firmaDe(CUERPO) }),
    'coincide',
  )
})

test('sin secreto lo dice, no finge que está bien', () => {
  assert.strictEqual(
    evaluarFirmaMeta({ secreto: '', crudo: CUERPO, cabecera: firmaDe(CUERPO) }),
    'sin-secreto',
  )
})

test('sin cabecera lo dice', () => {
  assert.strictEqual(evaluarFirmaMeta({ secreto: SECRETO, crudo: CUERPO, cabecera: '' }), 'sin-cabecera')
})

test('sin cuerpo lo dice', () => {
  assert.strictEqual(evaluarFirmaMeta({ secreto: SECRETO, crudo: '', cabecera: firmaDe(CUERPO) }), 'sin-cuerpo')
})

test('una cabecera con formato raro no se confunde con un fallo de firma', () => {
  for (const raro of ['sha1=abc', 'abc123', 'sha256=', 'sha256=nohex', 'sha256=' + 'a'.repeat(63)]) {
    assert.strictEqual(
      evaluarFirmaMeta({ secreto: SECRETO, crudo: CUERPO, cabecera: raro }),
      'formato-raro',
      `${raro} debería dar formato-raro`,
    )
  }
})

test('acepta la firma en mayúsculas', () => {
  const f = firmaDe(CUERPO).toUpperCase().replace('SHA256=', 'sha256=')
  assert.strictEqual(evaluarFirmaMeta({ secreto: SECRETO, crudo: CUERPO, cabecera: f }), 'coincide')
})

test('observarFirmaMeta NUNCA lanza, pase lo que pase', () => {
  // Es lo único que importa de verdad hoy: observar no puede tumbar la
  // recepción de un mensaje de un cliente.
  for (const [cab, cru] of [[null, null], [undefined, undefined], [{}, {}], [123, 456], ['x', 'y']]) {
    assert.doesNotThrow(() => observarFirmaMeta(cab, cru))
  }
})

test('el archivo NO tiene ninguna rama que rechace', async () => {
  // Candado del acuerdo con Rodrigo: esto solo observa. Si alguien agrega un
  // rechazo acá sin discutirlo, esta prueba se cae.
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../lib/firma-meta.js', import.meta.url), 'utf8')
  // Se miran solo las líneas de CÓDIGO: los comentarios explican justamente que
  // acá no se rechaza, así que nombran 401 y 403 y harían fallar esto de gusto.
  const codigo = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
  for (const prohibido of ['401', '403', 'NextResponse', 'throw new']) {
    assert.ok(!codigo.includes(prohibido), `firma-meta.js no puede contener "${prohibido}" en el código`)
  }
})

// ── Detectar SIN tener el secreto ────────────────────────────────────────────
// Rodrigo no pudo recuperar META_APP_SECRET, así que la comparación completa no
// se puede hacer. Pero lo más grave SÍ se detecta sin él:
//
//   Meta manda SIEMPRE la cabecera `x-hub-signature-256`. Un POST que llega sin
//   ninguna cabecera casi con certeza NO es Meta.
//
// ☠️ El orden original tapaba justo eso: `sin-secreto` se evaluaba ANTES que
// `sin-cabecera`, así que sin el secreto TODO daba 'sin-secreto' y un atacante
// —que tampoco manda firma— se veía igual que la operación normal. La única
// señal que quedaba, escondida detrás de nuestra propia falta de configuración.

test('sin secreto TODAVIA distingue a quien no manda firma', () => {
  assert.equal(evaluarFirmaMeta({ secreto: '', cabecera: null, crudo: '{}' }), 'sin-cabecera')
})

test('sin secreto tambien caza una cabecera con formato raro', () => {
  assert.equal(evaluarFirmaMeta({ secreto: '', cabecera: 'sha256=nada', crudo: '{}' }), 'formato-raro')
})

test('con cabecera valida y sin secreto, se admite que no se puede comprobar', () => {
  const firma = 'sha256=' + 'a'.repeat(64)
  assert.equal(evaluarFirmaMeta({ secreto: '', cabecera: firma, crudo: '{}' }), 'sin-secreto')
})

test('con secreto, el comportamiento de siempre no cambia', () => {
  assert.equal(evaluarFirmaMeta({ secreto: 'x', cabecera: null, crudo: '{}' }), 'sin-cabecera')
  assert.equal(evaluarFirmaMeta({ secreto: 'x', cabecera: 'sha256=' + 'a'.repeat(64), crudo: '' }), 'sin-cuerpo')
})

// ── Qué merece despertar a alguien por Telegram ──────────────────────────────
import { debeAvisar } from '../lib/firma-meta.js'

test('avisa cuando alguien postea SIN firma', () => {
  assert.equal(debeAvisar('sin-cabecera'), true)
})

test('avisa si la firma no cuadra o viene deforme', () => {
  assert.equal(debeAvisar('NO-coincide'), true)
  assert.equal(debeAvisar('formato-raro'), true)
})

test('NO avisa cuando todo esta bien', () => {
  assert.equal(debeAvisar('coincide'), false)
})

test('☠️ NO avisa por sin-secreto: es NUESTRA falta, no un ataque', () => {
  // IND recibe 2.684 webhooks al día. Avisar por esto sería un mensaje de
  // Telegram cada 30 segundos, y en dos horas nadie mira más esa alerta —
  // justo cuando llegue la de verdad.
  assert.equal(debeAvisar('sin-secreto'), false)
})

test('un veredicto desconocido NO despierta a nadie', () => {
  // Si mañana se agrega un veredicto nuevo, que no empiece a sonar solo: se
  // decide a propósito si merece aviso.
  assert.equal(debeAvisar('inventado'), false)
  assert.equal(debeAvisar(''), false)
  assert.equal(debeAvisar(null), false)
})
