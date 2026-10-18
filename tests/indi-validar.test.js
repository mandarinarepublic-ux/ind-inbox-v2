import test from 'node:test'
import assert from 'node:assert'
import { validarFila, validarFeriado } from '../lib/indi-validar.js'

const HOY = '2026-10-18'
const base = { tipo: 'regla', titulo: 'Abono', contenido: 'Mínimo 50%' }

test('fila válida pasa', () => {
  const r = validarFila(base, HOY)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.fila.titulo, 'Abono')
})
test('tipo inválido', () => {
  assert.strictEqual(validarFila({ ...base, tipo: 'otro' }, HOY).ok, false)
})
test('título vacío o de más de 80', () => {
  assert.strictEqual(validarFila({ ...base, titulo: '   ' }, HOY).ok, false)
  assert.strictEqual(validarFila({ ...base, titulo: 'a'.repeat(81) }, HOY).ok, false)
  assert.strictEqual(validarFila({ ...base, titulo: 'a'.repeat(80) }, HOY).ok, true)
})
test('contenido de más de 1500', () => {
  assert.strictEqual(validarFila({ ...base, contenido: 'a'.repeat(1501) }, HOY).ok, false)
  assert.strictEqual(validarFila({ ...base, contenido: 'a'.repeat(1500) }, HOY).ok, true)
})
test('precio: números, texto con coma, null y negativos', () => {
  assert.strictEqual(validarFila({ ...base, precio: '20' }, HOY).fila.precio, 20)
  assert.strictEqual(validarFila({ ...base, precio: '20,5' }, HOY).fila.precio, 20.5)
  assert.strictEqual(validarFila({ ...base, precio: 0 }, HOY).fila.precio, 0)
  assert.strictEqual(validarFila({ ...base, precio: '' }, HOY).fila.precio, null)
  assert.strictEqual(validarFila({ ...base, precio: null }, HOY).fila.precio, null)
  assert.strictEqual(validarFila({ ...base, precio: -1 }, HOY).ok, false)
  assert.strictEqual(validarFila({ ...base, precio: 'abc' }, HOY).ok, false)
})
test('promo sin fecha de fin', () => {
  const r = validarFila({ ...base, tipo: 'promo' }, HOY)
  assert.deepStrictEqual(r, { ok: false, error: 'La promo necesita una fecha de fin' })
})
test('promo con fecha pasada', () => {
  const r = validarFila({ ...base, tipo: 'promo', vigente_hasta: '2026-10-17' }, HOY)
  assert.deepStrictEqual(r, { ok: false, error: 'La fecha de fin ya pasó' })
})
test('promo que vence hoy o después pasa', () => {
  assert.strictEqual(validarFila({ ...base, tipo: 'promo', vigente_hasta: '2026-10-18' }, HOY).ok, true)
  assert.strictEqual(validarFila({ ...base, tipo: 'promo', vigente_hasta: '2026-12-01' }, HOY).ok, true)
})
test('no promo: la fecha queda null si no viene', () => {
  assert.strictEqual(validarFila(base, HOY).fila.vigente_hasta, null)
})
test('la fila saneada solo lleva columnas conocidas', () => {
  const r = validarFila({ ...base, cuenta: 'MANDI', hack: 1, activo: false, orden: 4, id: 'x' }, HOY)
  assert.strictEqual(r.fila.cuenta, undefined)
  assert.strictEqual(r.fila.hack, undefined)
  assert.strictEqual(r.fila.id, 'x')
  assert.strictEqual(r.fila.activo, false)
  assert.strictEqual(r.fila.orden, 4)
})

test('feriado válido', () => {
  assert.deepStrictEqual(validarFeriado({ fecha: '2026-12-25', nombre: 'Navidad' }), { ok: true, fecha: '2026-12-25', nombre: 'Navidad' })
})
test('feriado con fecha imposible o mal formada', () => {
  assert.strictEqual(validarFeriado({ fecha: '2026-02-30', nombre: 'x' }).ok, false)
  assert.strictEqual(validarFeriado({ fecha: '25/12/2026', nombre: 'x' }).ok, false)
  assert.strictEqual(validarFeriado({ fecha: undefined, nombre: 'x' }).ok, false)
})
test('feriado con nombre vacío o largo', () => {
  assert.strictEqual(validarFeriado({ fecha: '2026-12-25', nombre: ' ' }).ok, false)
  assert.strictEqual(validarFeriado({ fecha: '2026-12-25', nombre: 'a'.repeat(61) }).ok, false)
})
