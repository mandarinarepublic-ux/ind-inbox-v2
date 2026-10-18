// Lógica pura de la pantalla 🧠 INDI: permiso que ve el navegador, promos
// vencidas, cómo se lee el historial y el historial que se le manda a Indi al probar.
import test from 'node:test'
import assert from 'node:assert'
import { permisoIndi } from '../lib/editor-indi.js'
import { fechaCorta, avisoVencida, accionHistorial, nombreTabla, historialParaAgente, campoDelError, cambiosDeFila, tituloDeCambio } from '../lib/indi-vista.js'

const AND = { id: 'AND', nombre: 'Andrés Admin', rol: 'ADMIN', tiendas: ['INDSTORE'], activo: true }

test('permiso: admin de INDSTORE puede editar y se dice quién es', () => {
  assert.deepStrictEqual(permisoIndi(AND), { puedeEditar: true, nombre: 'Andrés Admin' })
})
test('permiso: vendedor ve pero no edita; sin sesión tampoco', () => {
  assert.deepStrictEqual(permisoIndi({ ...AND, rol: 'VENDEDOR' }), { puedeEditar: false, nombre: 'Andrés Admin' })
  assert.deepStrictEqual(permisoIndi(null), { puedeEditar: false, nombre: null })
})

test('fecha corta en español, sin correrse de día por la zona horaria', () => {
  assert.strictEqual(fechaCorta('2026-10-01'), '1 oct 2026')
  assert.strictEqual(fechaCorta('2026-12-31'), '31 dic 2026')
  assert.strictEqual(fechaCorta(''), '')
  assert.strictEqual(fechaCorta('nada'), 'nada')
})
test('promo vencida dice cuándo venció; vigente o sin fecha, nada', () => {
  assert.strictEqual(avisoVencida({ tipo: 'promo', vigente_hasta: '2026-10-10', vencida: true }), 'venció el 10 oct 2026')
  assert.strictEqual(avisoVencida({ tipo: 'promo', vigente_hasta: '2026-11-10', vencida: false }), '')
  assert.strictEqual(avisoVencida({ tipo: 'precio', vigente_hasta: null, vencida: false }), '')
})

test('historial: alta, borrado y cambio', () => {
  assert.strictEqual(accionHistorial({ antes: null, despues: { a: 1 } }), 'Creó')
  assert.strictEqual(accionHistorial({ antes: { a: 1 }, despues: null }), 'Borró')
  assert.strictEqual(accionHistorial({ antes: { a: 1 }, despues: { a: 2 } }), 'Cambió')
})
test('historial: nombre de la tabla para humanos', () => {
  assert.strictEqual(nombreTabla('indi_conocimiento'), 'Lo que sabe Indi')
  assert.strictEqual(nombreTabla('indi_feriados'), 'Feriados')
  assert.strictEqual(nombreTabla('respuestas_rapidas'), 'Respuestas rápidas')
  assert.strictEqual(nombreTabla('otra'), 'otra')
})

test('probar: el chat local pasa al formato del agente, sin avisos ni mensajes vacíos', () => {
  const chat = [
    { de: 'cliente', texto: 'hola' },
    { de: 'indi', texto: 'Hola, soy Indi', imagenes: ['u1'] },
    { de: 'aviso', texto: 'Aquí Indi pasaría el chat a una persona' },
    { de: 'cliente', texto: '   ' },
    { de: 'indi', texto: '', imagenes: ['u2'] },
  ]
  assert.deepStrictEqual(historialParaAgente(chat), [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: 'Hola, soy Indi' },
  ])
  assert.deepStrictEqual(historialParaAgente(null), [])
})

test('el error del servidor se pone junto al campo que lo causó', () => {
  assert.strictEqual(campoDelError('El título debe tener entre 1 y 80 caracteres'), 'titulo')
  assert.strictEqual(campoDelError('El contenido pasa de 1500 caracteres'), 'contenido')
  assert.strictEqual(campoDelError('El precio debe ser un número mayor o igual a 0'), 'precio')
  assert.strictEqual(campoDelError('La promo necesita una fecha de fin'), 'vigente_hasta')
  assert.strictEqual(campoDelError('La fecha de fin ya pasó'), 'vigente_hasta')
  assert.strictEqual(campoDelError('El nombre debe tener entre 1 y 60 caracteres'), 'nombre')
  assert.strictEqual(campoDelError('La fecha no es válida'), 'fecha')
  assert.strictEqual(campoDelError('Solo Rodrigo y Xavier pueden cambiar a Indi'), 'general')
  assert.strictEqual(campoDelError(''), 'general')
})

test('historial: solo las columnas que cambiaron, sin las de control', () => {
  const antes = { id: 'k', cuenta: 'IND', titulo: 'A', precio: 10, actualizado_por: 'AND', actualizado_en: 't1' }
  const despues = { ...antes, titulo: 'B', actualizado_por: 'XAV', actualizado_en: 't2' }
  assert.deepStrictEqual(cambiosDeFila({ antes, despues }), [{ col: 'titulo', antes: 'A', despues: 'B' }])
  assert.deepStrictEqual(cambiosDeFila({ antes: null, despues: { id: 'k', cuenta: 'IND', titulo: 'A' } }), [{ col: 'titulo', antes: null, despues: 'A' }])
  assert.deepStrictEqual(cambiosDeFila({ antes: { imagenes: ['a'] }, despues: { imagenes: ['a'] } }), [])
})
test('historial: de qué fila se habla', () => {
  assert.strictEqual(tituloDeCambio({ fila_id: 'k', despues: { titulo: 'Combo' } }), 'Combo')
  assert.strictEqual(tituloDeCambio({ fila_id: 'k', antes: { titulo: 'Viejo' }, despues: null }), 'Viejo')
  assert.strictEqual(tituloDeCambio({ fila_id: '2026-12-25', despues: { fecha: '2026-12-25', nombre: 'Navidad' } }), 'Navidad (25 dic 2026)')
  assert.strictEqual(tituloDeCambio({ fila_id: 'r1', despues: { texto: 'Hola, estos son los precios de las camisetas' } }), 'Hola, estos son los precios de las camis…')
  assert.strictEqual(tituloDeCambio({ fila_id: 'r9', antes: null, despues: null }), 'r9')
})
