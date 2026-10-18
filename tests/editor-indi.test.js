// Quién puede cambiar lo que sabe Indi, y cómo se deshace un cambio del historial.
import test from 'node:test'
import assert from 'node:assert'
import { puedeEditarIndi } from '../lib/editor-indi.js'
import { operacionDeshacer } from '../lib/indi-deshacer.js'

const AND = { usuario_id: 'AND', nombre: 'Andrés Admin', rol: 'ADMIN', tiendas: ['MANDARINA', 'INDSTORE'], activo: true }
const XAV = { usuario_id: 'XAV', nombre: 'Xavier Castillo', rol: 'ADMIN', tiendas: ['MANDARINA', 'INDSTORE'], activo: true }
const ROD = { usuario_id: 'ROD', nombre: 'RODRIGO', rol: 'VENDEDOR', tiendas: ['MANDARINA'], activo: true }

test('los admins de INDSTORE pueden editar a Indi', () => {
  assert.strictEqual(puedeEditarIndi(AND), true)
  assert.strictEqual(puedeEditarIndi(XAV), true)
})
test('un vendedor no puede', () => {
  assert.strictEqual(puedeEditarIndi(ROD), false)
  assert.strictEqual(puedeEditarIndi({ ...AND, rol: 'VENDEDOR' }), false)
})
test('admin sin INDSTORE no puede', () => {
  assert.strictEqual(puedeEditarIndi({ ...AND, tiendas: ['MANDARINA'] }), false)
  assert.strictEqual(puedeEditarIndi({ ...AND, tiendas: null }), false)
})
test('inactivo no puede, ni null', () => {
  assert.strictEqual(puedeEditarIndi({ ...AND, activo: false }), false)
  assert.strictEqual(puedeEditarIndi(null), false)
})

test('deshacer un alta borra la fila', () => {
  const op = operacionDeshacer({ tabla: 'indi_conocimiento', fila_id: 'abc', antes: null, despues: { id: 'abc', titulo: 'x' } })
  assert.deepStrictEqual(op, { tabla: 'indi_conocimiento', tipo: 'borrar', id: 'abc', datos: null })
})
test('deshacer un borrado reinserta lo de antes', () => {
  const antes = { id: 'abc', titulo: 'x', cuenta: 'IND' }
  const op = operacionDeshacer({ tabla: 'indi_conocimiento', fila_id: 'abc', antes, despues: null })
  assert.deepStrictEqual(op, { tabla: 'indi_conocimiento', tipo: 'reinsertar', id: 'abc', datos: antes })
})
test('deshacer una edición restaura lo de antes', () => {
  const antes = { id: 'abc', titulo: 'viejo', cuenta: 'IND' }
  const op = operacionDeshacer({ tabla: 'indi_conocimiento', fila_id: 'abc', antes, despues: { ...antes, titulo: 'nuevo' } })
  assert.strictEqual(op.tipo, 'restaurar')
  assert.strictEqual(op.datos.titulo, 'viejo')
})
test('feriados se identifican por fecha', () => {
  const op = operacionDeshacer({ tabla: 'indi_feriados', fila_id: '2026-12-25', antes: null, despues: { fecha: '2026-12-25', nombre: 'Navidad' } })
  assert.deepStrictEqual(op, { tabla: 'indi_feriados', tipo: 'borrar', fecha: '2026-12-25', datos: null })
})
test('respuestas rápidas: solo se restauran uso_ia y el contenido', () => {
  const antes = { id: 'r1', cuenta: 'IND', texto: 'hola', grupo: 'g', imagenes: 'u', uso_ia: true, orden: 3, actualizado_por: 'x' }
  const op = operacionDeshacer({ tabla: 'respuestas_rapidas', fila_id: 'r1', antes, despues: { ...antes, uso_ia: false } })
  assert.strictEqual(op.tipo, 'restaurar')
  assert.deepStrictEqual(Object.keys(op.datos).sort(), ['grupo', 'imagenes', 'texto', 'uso_ia'])
  assert.strictEqual(op.datos.uso_ia, true)
})
test('respuestas rápidas: un alta o borrado no se deshace', () => {
  assert.strictEqual(operacionDeshacer({ tabla: 'respuestas_rapidas', fila_id: 'r1', antes: null, despues: { id: 'r1' } }), null)
})
test('tabla desconocida o fila vacía no se deshace', () => {
  assert.strictEqual(operacionDeshacer({ tabla: 'otra', fila_id: '1', antes: { a: 1 }, despues: { a: 2 } }), null)
  assert.strictEqual(operacionDeshacer({ tabla: 'indi_conocimiento', fila_id: '1', antes: null, despues: null }), null)
  assert.strictEqual(operacionDeshacer(null), null)
})
