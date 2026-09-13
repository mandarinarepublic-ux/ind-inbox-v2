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

test('el seguimiento por temperatura arranca APAGADO y con las tres temperaturas', () => {
  assert.equal(DEFAULTS.seguimientos.activo, false)
  assert.equal(DEFAULTS.seguimientos.caliente.horas, 23)
  assert.equal(DEFAULTS.seguimientos.tibio.horas, 12)
  assert.equal(DEFAULTS.seguimientos.frio.horas, 22)
  for (const t of ['caliente', 'tibio', 'frio']) {
    assert.equal(DEFAULTS.seguimientos[t].activo, false)
    assert.deepEqual(DEFAULTS.seguimientos[t].botones, [])
  }
})

test('tocar la IA no pisa los seguimientos', () => {
  const nueva = merge(DEFAULTS, { ia: { principal: false } })
  assert.equal(nueva.seguimientos.caliente.horas, 23)
})

test('la ENCUESTA DE REACTIVACIÓN arranca apagada, con sus tres botones de ejemplo', () => {
  const e = DEFAULTS.seguimientos.encuesta
  assert.equal(e.activo, false)
  assert.equal(e.horas, 6)
  assert.deepEqual(e.botones.map(b => b.title), ['Es el precio', 'Sigo pensándolo', 'Otro motivo'])
})
