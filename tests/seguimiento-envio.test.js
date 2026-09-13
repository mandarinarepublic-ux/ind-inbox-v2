import test from 'node:test'
import assert from 'node:assert'
import { normalizarBotones, cuerpoSeguimiento } from '../lib/seguimiento-envio.js'

const contacto = { telefono: '593999000111', nombre: 'Ana', alias: '', phoneId: '1153686904504422' }

test('sin botones sale como TEXTO plano por el canal del contacto', () => {
  const b = cuerpoSeguimiento({ regla: { texto: ' ¿Seguimos? ', botones: [] }, contacto })
  assert.deepEqual(b, { Telefono: '593999000111', Nombre: 'Ana', Mensaje: '¿Seguimos?', Canal: '1153686904504422' })
})

test('con botones sale como mensaje INTERACTIVO con hasta 3 botones', () => {
  const b = cuerpoSeguimiento({ regla: { texto: '¿Seguimos?', botones: [{ title: 'Sí, me interesa' }, { title: 'Ya compré' }] }, contacto })
  assert.equal(b.TipoMensaje, 'interactive_buttons')
  assert.equal(b.Cuerpo, '¿Seguimos?')
  assert.equal(b.Canal, '1153686904504422')
  assert.deepEqual(JSON.parse(b.Botones), [
    { type: 'reply', reply: { id: 'seg_1', title: 'Sí, me interesa' } },
    { type: 'reply', reply: { id: 'seg_2', title: 'Ya compré' } },
  ])
})

test('el alias manda sobre el nombre de Meta', () => {
  const b = cuerpoSeguimiento({ regla: { texto: 'Hola' }, contacto: { ...contacto, alias: 'Anita' } })
  assert.equal(b.Nombre, 'Anita')
})

test('un botón vacío no cuenta y el título se recorta a 20 (límite de WhatsApp)', () => {
  const bs = normalizarBotones([{ title: '   ' }, { title: 'Quiero más información por favor' }, null, { title: 'Ok' }])
  assert.deepEqual(bs, [
    { id: 'seg_1', title: 'Quiero más informaci' },
    { id: 'seg_2', title: 'Ok' },
  ])
})

test('nunca más de 3 botones', () => {
  const bs = normalizarBotones([{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }])
  assert.equal(bs.length, 3)
})

test('acepta títulos sueltos (strings) además de objetos', () => {
  assert.deepEqual(normalizarBotones(['Sí', 'No']), [{ id: 'seg_1', title: 'Sí' }, { id: 'seg_2', title: 'No' }])
})
