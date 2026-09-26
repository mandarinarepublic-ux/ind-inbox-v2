import test from 'node:test'
import assert from 'node:assert'
import { hostPermitidoParaProxy, llevaToken } from '../lib/fuente-media.js'

test('el proxy solo acepta hosts de Meta (si no, se lleva el token a cualquier lado)', () => {
  assert.equal(hostPermitidoParaProxy('https://lookaside.fbsbx.com/x'), true)
  assert.equal(hostPermitidoParaProxy('https://mmg.whatsapp.net/v/x.enc'), true)
  assert.equal(hostPermitidoParaProxy('https://scontent.xx.fbcdn.net/v/x.jpg'), true)
  assert.equal(hostPermitidoParaProxy('https://evil.example.com/x'), false)
  assert.equal(hostPermitidoParaProxy('https://lookaside.fbsbx.com.evil.com/x'), false)
  assert.equal(hostPermitidoParaProxy('no es url'), false)
})

test('el token solo va a la API de Meta y a WhatsApp, no al CDN de anuncios', () => {
  assert.equal(llevaToken('https://graph.facebook.com/v19.0/1'), true)
  assert.equal(llevaToken('https://mmg.whatsapp.net/v/x'), true)
  assert.equal(llevaToken('https://scontent.xx.fbcdn.net/v/x.jpg'), false)
  assert.equal(llevaToken('https://whatsapp.net.attacker.io/x'), false)
})
