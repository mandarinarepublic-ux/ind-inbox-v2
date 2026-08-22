import test from 'node:test'
import assert from 'node:assert'
import { debePausar, hayNovedad, VENTANA_INACTIVIDAD_MS, EVENTOS_ACTIVIDAD } from '../lib/inactividad.js'

const AHORA = 1_700_000_000_000

test('la ventana por defecto es de 30 minutos', () => {
  assert.equal(VENTANA_INACTIVIDAD_MS, 30 * 60 * 1000)
})

test('no pausa si la actividad es reciente', () => {
  assert.equal(debePausar(AHORA - 60_000, AHORA), false)
})

test('no pausa justo antes de cumplirse la ventana', () => {
  assert.equal(debePausar(AHORA - VENTANA_INACTIVIDAD_MS + 1, AHORA), false)
})

test('pausa exactamente al cumplirse la ventana', () => {
  assert.equal(debePausar(AHORA - VENTANA_INACTIVIDAD_MS, AHORA), true)
})

test('pausa cuando se paso de largo', () => {
  assert.equal(debePausar(AHORA - 4 * 60 * 60 * 1000, AHORA), true)
})

// A PRUEBA DE FALLOS: igual que en lib/push.js, un dato roto NO puede silenciar
// el inbox. Ante la duda se sigue polleando.
test('NO pausa si no hay dato de actividad', () => {
  assert.equal(debePausar(null, AHORA), false)
  assert.equal(debePausar(undefined, AHORA), false)
})

test('NO pausa si el dato es basura', () => {
  assert.equal(debePausar(NaN, AHORA), false)
  assert.equal(debePausar('ayer', AHORA), false)
  assert.equal(debePausar(Infinity, AHORA), false)
})

test('la ventana se puede ajustar por parametro', () => {
  assert.equal(debePausar(AHORA - 5000, AHORA, 1000), true)
  assert.equal(debePausar(AHORA - 500, AHORA, 1000), false)
})

test('EVENTOS_ACTIVIDAD trae gestos deliberados, no mousemove', () => {
  assert.ok(EVENTOS_ACTIVIDAD.includes('pointerdown'))
  assert.ok(EVENTOS_ACTIVIDAD.includes('keydown'))
  assert.ok(EVENTOS_ACTIVIDAD.includes('wheel'))
  // mousemove se dispara con cualquier vibracion del escritorio y nunca dejaria
  // pausar: la pestana abandonada seguiria polleando toda la noche.
  assert.ok(!EVENTOS_ACTIVIDAD.includes('mousemove'))
})

// ── El latido ligero (adicion sobre el plan del 14-ago) ───────────
// La pausa a secas dejaba a IND sin aviso: con 1 sola suscripcion push, esa
// pantalla ES la notificacion del equipo. En vez de cortar el latido del todo,
// en pausa se pide SOLO el contador de pendientes (unos bytes contra 4,36 MB).
test('hayNovedad avisa cuando el contador SUBIO', () => {
  assert.equal(hayNovedad({ a: 1 }, { a: 2 }), true)
  assert.equal(hayNovedad({ a: 1 }, { a: 1, b: 3 }), true)
  assert.equal(hayNovedad({}, { a: 1 }), true)
})

test('hayNovedad NO avisa si todo sigue igual o BAJO', () => {
  assert.equal(hayNovedad({ a: 2 }, { a: 2 }), false)
  // Bajar es alguien contestando desde otro lado: no es novedad para esta pantalla.
  assert.equal(hayNovedad({ a: 5 }, { a: 2 }), false)
  assert.equal(hayNovedad({ a: 1 }, {}), false)
})

// Ante dato roto NO se inventa una novedad: un aviso falso cada 20 s entrena a
// ignorarlos, que es justo lo que no puede pasar con el aviso de un lead.
test('hayNovedad tolera basura sin inventar avisos', () => {
  assert.equal(hayNovedad(null, null), false)
  assert.equal(hayNovedad(undefined, { a: 1 }), true)
  assert.equal(hayNovedad({ a: 1 }, null), false)
  assert.equal(hayNovedad({ a: 'x' }, { a: 'y' }), false)
})
