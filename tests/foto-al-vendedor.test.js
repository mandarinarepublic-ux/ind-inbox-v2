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

import { medioParaVendedor } from '../lib/foto-al-vendedor.js'

test('medioParaVendedor: foto, audio, video y documento pasan al vendedor con su nota', () => {
  assert.equal(medioParaVendedor({ tipo: 'imagen' }), '📷 Mandó una foto')
  assert.equal(medioParaVendedor({ tipo: 'image' }), '📷 Mandó una foto')
  assert.equal(medioParaVendedor({ tipo: 'audio' }), '🎤 Mandó un audio')
  assert.equal(medioParaVendedor({ tipo: 'video' }), '🎥 Mandó un video')
  assert.equal(medioParaVendedor({ tipo: 'documento' }), '📄 Mandó un documento')
  assert.equal(medioParaVendedor({ tipo: 'document' }), '📄 Mandó un documento')
})

test('medioParaVendedor: texto, sticker y lo demás no se derivan', () => {
  assert.equal(medioParaVendedor({ tipo: 'texto' }), null)
  assert.equal(medioParaVendedor({ tipo: 'sticker' }), null)
  assert.equal(medioParaVendedor({ tipo: 'order' }), null)
  assert.equal(medioParaVendedor(null), null)
})
