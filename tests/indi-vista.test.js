// Lógica pura de la pantalla 🧠 INDI: permiso que ve el navegador, promos
// vencidas, cómo se lee el historial y el historial que se le manda a Indi al probar.
import test from 'node:test'
import assert from 'node:assert'
import { permisoIndi } from '../lib/editor-indi.js'
import { fechaCorta, avisoVencida, accionHistorial, nombreTabla, historialParaAgente, campoDelError, cambiosDeFila, tituloDeCambio, burbujasDeRespuesta, dinero, pistaPromoVencida } from '../lib/indi-vista.js'

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

test('probar: respuesta normal = burbuja de Indi con texto y fotos', () => {
  assert.deepStrictEqual(burbujasDeRespuesta({ reply: 'Hola', imagenes: ['u1'] }), [
    { de: 'indi', texto: 'Hola', imagenes: ['u1'] },
  ])
})

test('probar: sinBase avisa que Indi no pudo leer su base (y no "no contestó nada")', () => {
  assert.deepStrictEqual(burbujasDeRespuesta({ reply: '', imagenes: [], sinBase: true }), [
    { de: 'error', texto: 'Indi no pudo leer su base: en un chat real, el chat pasaría a una persona.' },
  ])
})

test('probar: escalarPedido o escalado muestran el traspaso con el motivo', () => {
  const avisoCon = (m) => ({ de: 'aviso', texto: `Aquí Indi pasaría el chat a una persona: ${m}` })
  assert.deepStrictEqual(burbujasDeRespuesta({ reply: 'Te paso con un asesor', escalarPedido: true, escalado: false, motivo: 'quiere factura' }), [
    { de: 'indi', texto: 'Te paso con un asesor', imagenes: [] },
    avisoCon('quiere factura'),
  ])
  assert.deepStrictEqual(burbujasDeRespuesta({ reply: '', escalado: true, motivo: '' }), [avisoCon('sin motivo')])
})

test('probar: sin texto ni fotos ni traspaso = error de "no contestó nada"', () => {
  assert.deepStrictEqual(burbujasDeRespuesta({ reply: '', imagenes: [] }), [
    { de: 'error', texto: 'Indi no contestó nada (en un chat real, pasaría a una persona).' },
  ])
  assert.deepStrictEqual(burbujasDeRespuesta(null), [
    { de: 'error', texto: 'Indi no contestó nada (en un chat real, pasaría a una persona).' },
  ])
})

test('dinero: formato de Ecuador, coma decimal y sin ",00" en enteros', () => {
  assert.strictEqual(dinero(20), '$20')
  assert.strictEqual(dinero('20.00'), '$20')
  assert.strictEqual(dinero(3.5), '$3,50')
  assert.strictEqual(dinero('3.5'), '$3,50')
  assert.strictEqual(dinero(0.99), '$0,99')
  assert.strictEqual(dinero(0), '$0')
  assert.strictEqual(dinero(19.999), '$20')
  assert.strictEqual(dinero(2.005), '$2,01')
})

test('dinero: vacío no pinta nada y lo que no es número sale tal cual', () => {
  assert.strictEqual(dinero(null), '')
  assert.strictEqual(dinero(undefined), '')
  assert.strictEqual(dinero(''), '')
  assert.strictEqual(dinero('consultar'), 'consultar')
})

test('el error de orden va junto al campo ORDEN', () => {
  assert.strictEqual(campoDelError('El orden debe ser un número entero mayor o igual a 0'), 'orden')
})

test('formulario: promo con fecha pasada pide fecha nueva o borrarla; vigente o no promo, nada', () => {
  const HOY = '2026-10-18'
  const PISTA = 'Esta promo ya venció: ponle una fecha nueva o bórrala.'
  assert.strictEqual(pistaPromoVencida({ tipo: 'promo', vigente_hasta: '2026-10-17' }, HOY), PISTA)
  assert.strictEqual(pistaPromoVencida({ tipo: 'promo', vigente_hasta: '2026-10-18' }, HOY), '')
  assert.strictEqual(pistaPromoVencida({ tipo: 'promo', vigente_hasta: '' }, HOY), '')
  assert.strictEqual(pistaPromoVencida({ tipo: 'precio', vigente_hasta: '2026-01-01' }, HOY), '')
})
