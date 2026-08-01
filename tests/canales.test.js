// Cada número vive en una WABA distinta, y la Conversions API rechaza el evento
// si le mandamos la que no es. El mapa está en lib/canales.js y NO tiene forma de
// avisar cuando queda desactualizado: si mañana se migra un número (ya pasó el
// 28-jul con el 3326) el inbox sigue funcionando igual y lo único que se rompe es
// la atribución de la pauta, en silencio y semanas después.
//
// Los valores esperados salieron del tráfico real: entry[0].id de
// inbox.webhook_eventos, cruzado contra el phone_number_id de cada evento.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CANALES, wabaIdDePhoneId } from '../lib/canales.js'

test('cada canal declara su WABA', () => {
  for (const c of CANALES) {
    assert.ok(c.wabaId, `el canal ${c.id} no tiene wabaId`)
    assert.ok(c.phoneId, `el canal ${c.id} no tiene phoneId`)
  }
})

test('dos canales distintos no comparten WABA', () => {
  const wabas = CANALES.map(c => String(c.wabaId))
  assert.equal(new Set(wabas).size, wabas.length, 'hay canales apuntando a la misma WABA')
})

test('wabaIdDePhoneId resuelve el 3326 (WABA recreada el 28-jul)', () => {
  assert.equal(wabaIdDePhoneId('1153686904504422'), '1043571971409840')
})

test('wabaIdDePhoneId resuelve el 9804', () => {
  assert.equal(wabaIdDePhoneId('2241248862581450'), '396966121059860')
})

test('wabaIdDePhoneId devuelve null si el número no es nuestro', () => {
  // Devolver el canal principal por defecto (como hace phoneIdDeCanal) sería
  // peor que no mandar nada: el evento saldría atribuido a la WABA equivocada.
  // Ojo: 1135333936337730 era el 3326 ANTES de la migración; su WABA murió.
  assert.equal(wabaIdDePhoneId('1135333936337730'), null)
  assert.equal(wabaIdDePhoneId(''), null)
  assert.equal(wabaIdDePhoneId(undefined), null)
})
