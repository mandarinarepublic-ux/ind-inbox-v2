import test from 'node:test'
import assert from 'node:assert'
import { extraerEchoes } from '../lib/echoes.js'

// Payload REAL de Meta (inbox.webhook_eventos, 29-jul), recortado. Número IND 9804.
const REAL = {
  metadata: { phone_number_id: '2241248862581450', display_phone_number: '593984159804' },
  contacts: [{ wa_id: '593987498489', user_id: 'EC.1901471227178306' }],
  message_echoes: [{
    id: 'wamid.HBgMNTkzOTg3NDk4NDg5FQIAERgWM0VCMDVFNTUwMjc3M0VBNTU3MTExQQA=',
    to: '593987498489',
    from: '593984159804',
    text: { body: 'que hago' },
    type: 'text',
    timestamp: '1785363650',
  }],
}

test('el telefono es el DESTINATARIO, nunca el remitente', () => {
  const [e] = extraerEchoes(REAL)
  assert.equal(e.telefono, '593987498489')
  assert.notEqual(e.telefono, '593984159804') // 'from' somos nosotros
})

test('el canal sale del metadata, no del from', () => {
  const [e] = extraerEchoes(REAL)
  assert.equal(e.phoneId, '2241248862581450')
})

test('traduce el contenido y la fecha', () => {
  const [e] = extraerEchoes(REAL)
  assert.equal(e.tipo, 'texto')
  assert.equal(e.contenido, 'que hago')
  assert.equal(e.wamid, 'wamid.HBgMNTkzOTg3NDk4NDg5FQIAERgWM0VCMDVFNTUwMjc3M0VBNTU3MTExQQA=')
  assert.equal(e.fecha, new Date(1785363650 * 1000).toISOString())
})

test('una foto mandada desde el celular trae su media id', () => {
  const r = extraerEchoes({
    metadata: { phone_number_id: '2241248862581450' },
    message_echoes: [{ id: 'W1', to: '593999', type: 'image', image: { id: 'MID9', caption: 'mira' } }],
  })
  assert.equal(r[0].tipo, 'imagen')
  assert.equal(r[0].mediaId, 'MID9')
  assert.equal(r[0].contenido, 'mira')
})

test('un echo sin destinatario o sin id se descarta, los demas siguen', () => {
  const r = extraerEchoes({
    metadata: { phone_number_id: 'P1' },
    message_echoes: [
      { id: 'W1', type: 'text', text: { body: 'sin to' } },
      { to: '593999', type: 'text', text: { body: 'sin id' } },
      { id: 'W3', to: '593888', type: 'text', text: { body: 'bueno' } },
    ],
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].wamid, 'W3')
})

test('un value vacio o sin echoes devuelve lista vacia, sin lanzar', () => {
  assert.deepEqual(extraerEchoes({}), [])
  assert.deepEqual(extraerEchoes(null), [])
  assert.deepEqual(extraerEchoes({ metadata: {}, messages: [{ id: 'X' }] }), [])
})
