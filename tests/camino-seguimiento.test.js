import test from 'node:test'
import assert from 'node:assert'
import { caminoDeSeguimiento } from '../lib/camino-seguimiento.js'

// Ids reales de lib/canales.js: 'principal' = 3326, 'secundario' = 9804.
const PRINCIPAL = '1153686904504422'
const chatConIA = { phoneId: PRINCIPAL, modoIA: true }
const chatSinIA = { phoneId: PRINCIPAL, modoIA: false }

test('bot APAGADO en el número: sale el texto aunque el chat diga IA', () => {
  // Este es el caso real: el cortafuegos del AUTO está apagado y TODOS los chats
  // nacían con IA prendida. Mirar el chat y no el número saltaba a todos.
  const config = { ia: { principal: false, secundario: false } }
  assert.equal(caminoDeSeguimiento({ config, contacto: chatConIA }), 'texto')
})

test('bot PRENDIDO en el número y chat en IA: se salta, lo maneja el bot', () => {
  const config = { ia: { principal: true } }
  assert.equal(caminoDeSeguimiento({ config, contacto: chatConIA }), 'saltar')
})

test('bot PRENDIDO en el número pero chat en HUMANO: sale el texto', () => {
  const config = { ia: { principal: true } }
  assert.equal(caminoDeSeguimiento({ config, contacto: chatSinIA }), 'texto')
})

test('sin config no lanza y trata al bot como activo (se salta)', () => {
  assert.equal(caminoDeSeguimiento({ config: null, contacto: chatConIA }), 'saltar')
})
