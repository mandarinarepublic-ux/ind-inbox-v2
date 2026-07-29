import test from 'node:test'
import assert from 'node:assert'
import { iaActivaEnCanal, decidirIA } from '../lib/ia-canal.js'

// Los phone_id por defecto de lib/canales.js / lib/meta-ids.js (sin env en las pruebas).
const PRINCIPAL  = '1153686904504422' // +593 99 995 3326
const SECUNDARIO = '2241248862581450' // +593 98 415 9804

test('sin config, la IA esta activa en los dos canales', () => {
  assert.equal(iaActivaEnCanal(null, PRINCIPAL), true)
  assert.equal(iaActivaEnCanal({}, SECUNDARIO), true)
})

test('apagar secundario no apaga principal', () => {
  const cfg = { ia: { principal: true, secundario: false } }
  assert.equal(iaActivaEnCanal(cfg, PRINCIPAL), true)
  assert.equal(iaActivaEnCanal(cfg, SECUNDARIO), false)
})

test('un canal desconocido NO bloquea (spec 7)', () => {
  const cfg = { ia: { principal: false, secundario: false } }
  assert.equal(iaActivaEnCanal(cfg, '999999999999'), true)
  assert.equal(iaActivaEnCanal(cfg, ''), true)
})

test('el cortafuegos gana sobre el chat en modo IA', () => {
  const cfg = { ia: { secundario: false } }
  const contacto = { telefono: '593987047531', modoIA: true }
  assert.equal(decidirIA({ config: cfg, phoneId: SECUNDARIO, contacto }), false)
})

test('con el canal prendido manda el interruptor del chat', () => {
  const cfg = { ia: { principal: true } }
  assert.equal(decidirIA({ config: cfg, phoneId: PRINCIPAL, contacto: { modoIA: true } }), true)
  assert.equal(decidirIA({ config: cfg, phoneId: PRINCIPAL, contacto: { modoIA: false } }), false)
})

test('contacto que no esta en la agenda: IA apagada', () => {
  const cfg = { ia: { principal: true } }
  assert.equal(decidirIA({ config: cfg, phoneId: PRINCIPAL, contacto: undefined }), false)
})
