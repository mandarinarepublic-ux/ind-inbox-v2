import test from 'node:test'
import assert from 'node:assert'
import { DEFAULTS, merge } from '../lib/automatizaciones.js'

test('la IA arranca PRENDIDA en los dos canales (el deploy no cambia nada)', () => {
  assert.equal(DEFAULTS.ia.principal, true)
  assert.equal(DEFAULTS.ia.secundario, true)
})

test('apagar un canal NO borra el otro (merge de un solo nivel)', () => {
  const base  = { ia: { principal: true, secundario: true } }
  const nueva = merge(base, { ia: { secundario: false } })
  assert.equal(nueva.ia.principal, true)
  assert.equal(nueva.ia.secundario, false)
})

test('tocar la IA no pisa los saludos ni las reactivaciones', () => {
  const nueva = merge(DEFAULTS, { ia: { principal: false } })
  assert.equal(nueva.saludo_nuevo.texto.length > 0, true)
  assert.equal(nueva.saludo_reactivacion.horas, 12)
})
