import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoIASinResponder } from '../lib/ia-motivo.js'
import { CANALES } from '../lib/canales.js'

const pid = CANALES[0].phoneId
const id = CANALES[0].id
const prendido = { ia: { [id]: true } }

test('chat APAGADO: no hay nada que explicar', () => {
  assert.equal(motivoIASinResponder({ iaChat: false, maestro: false, contacto: { sinAutomaticos: true } }), null)
})
test('maestro apagado gana a todo', () => {
  const m = motivoIASinResponder({ iaChat: true, maestro: false, config: { ia: { [id]: false } }, phoneId: pid })
  assert.match(m.corto, /toda la cuenta/)
})
test('número apagado en AUTOS', () => {
  const m = motivoIASinResponder({ iaChat: true, maestro: true, config: { ia: { [id]: false } }, phoneId: pid, etiquetaCanal: '3326' })
  assert.match(m.corto, /número 3326/)
})
test('interno y 🤫 (mismas reglas que decidirIA)', () => {
  assert.match(motivoIASinResponder({ iaChat: true, maestro: true, config: prendido, phoneId: pid, contacto: { tipoContacto: 'interno' } }).corto, /interno/i)
  assert.match(motivoIASinResponder({ iaChat: true, maestro: true, config: prendido, phoneId: pid, contacto: { sinAutomaticos: true } }).corto, /🤫/)
})
test('todo en orden: sin aviso', () => {
  assert.equal(motivoIASinResponder({ iaChat: true, maestro: true, config: prendido, phoneId: pid, contacto: { modoIA: true } }), null)
})
test('datos sin cargar: NO avisa', () => {
  assert.equal(motivoIASinResponder({ iaChat: true, maestro: null, config: null, phoneId: pid }), null)
})
