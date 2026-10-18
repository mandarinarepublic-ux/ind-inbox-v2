import test from 'node:test'
import assert from 'node:assert'
import { esFotoParaVendedor } from '../lib/foto-al-vendedor.js'

test('una foto (imagen o image) va al vendedor', () => {
  assert.equal(esFotoParaVendedor({ tipo: 'imagen' }), true)
  assert.equal(esFotoParaVendedor({ tipo: 'image' }), true)
})

test('texto, audio y sticker no se derivan', () => {
  assert.equal(esFotoParaVendedor({ tipo: 'texto' }), false)
  assert.equal(esFotoParaVendedor({ tipo: 'audio' }), false)
  assert.equal(esFotoParaVendedor({ tipo: 'sticker' }), false)
  assert.equal(esFotoParaVendedor(null), false)
})
