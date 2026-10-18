import test from 'node:test'
import assert from 'node:assert/strict'
import { enviosDeRespuesta } from '../lib/respuesta-indi.js'

test('sinBase:true → derivar, sin texto ni fotos', () => {
  assert.deepEqual(enviosDeRespuesta({ sinBase: true, reply: 'hola', imagenes: ['https://x.com/a.jpg'] }),
    { texto: '', imagenes: [], derivar: true })
})

test('con imagenes[]: esas, sin vacías ni repetidas, y el texto sin URLs de imagen', () => {
  const r = enviosDeRespuesta({
    reply_clean: 'Mira https://x.com/otra.png esto',
    imagenes: ['a.jpg', '', 'a.jpg', 'b.png'],
  })
  assert.deepEqual(r.imagenes, ['a.jpg', 'b.png'])
  assert.equal(r.texto, 'Mira  esto')
  assert.equal(r.derivar, false)
})

test('con imagenes[] vacío: no saca fotos del texto', () => {
  const r = enviosDeRespuesta({ reply: 'Hola', imagenes: [] })
  assert.deepEqual(r, { texto: 'Hola', imagenes: [], derivar: false })
})

test('agente viejo (sin imagenes): saca las fotos del texto', () => {
  const r = enviosDeRespuesta({ reply: 'Te muestro https://x.com/f.jpg?v=1 y https://x.com/f.jpg?v=1\n\n\n\nlisto' })
  assert.deepEqual(r.imagenes, ['https://x.com/f.jpg?v=1'])
  assert.equal(r.texto, 'Te muestro  y\n\nlisto')
  assert.equal(r.derivar, false)
})

test('respuesta vacía → nada que enviar', () => {
  assert.deepEqual(enviosDeRespuesta({}), { texto: '', imagenes: [], derivar: false })
})
