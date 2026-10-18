// La regla de etapas es COPIA del CRM (lib/crm-etapa-cliente.js): estas pruebas
// fijan los casos de la regla para que Indi y la página /pedido digan lo mismo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularEtapa, ETAPAS_CLIENTE } from '../lib/crm-etapa-cliente.js'

const base = { fecha_pedido: '2026-10-01T10:00:00Z', estado_pedido: 'ACTIVO' }

test('cancelado: sin etapa', () => {
  const r = calcularEtapa({ pedido: { ...base, estado_pedido: 'CANCELADO' } })
  assert.equal(r.etapa, null)
  assert.equal(r.cancelado, true)
})

test('solo creado: etapa 0 (Recibido)', () => {
  assert.equal(calcularEtapa({ pedido: base }).etapa, 0)
})

test('hoja impresa para producción: etapa 1 (Diseño)', () => {
  const pedido = { ...base, fecha_impresion_produccion: '2026-10-02T10:00:00Z' }
  assert.equal(calcularEtapa({ pedido }).etapa, 1)
})

test('ítem cortado: etapa 2 (Producción)', () => {
  const items = [{ subestado_corte: 'CORTADO' }]
  assert.equal(calcularEtapa({ pedido: base, items }).etapa, 2)
})

test('con guía: etapa 3 (Tránsito)', () => {
  assert.equal(calcularEtapa({ pedido: base, guia: { numero: 'X' } }).etapa, 3)
})

test('COMPLETADO y 25 h después: etapa 4 (Entregado)', () => {
  const pedido = { ...base, estado_pedido: 'COMPLETADO', fecha_actualizacion: '2026-10-05T10:00:00Z' }
  const ahora = new Date(Date.parse('2026-10-05T10:00:00Z') + 25 * 3600 * 1000)
  assert.equal(calcularEtapa({ pedido, ahora }).etapa, 4)
})

test('ETAPAS_CLIENTE: cinco etapas con nombre', () => {
  assert.deepEqual(ETAPAS_CLIENTE.map((e) => e.nombre), ['Recibido', 'Diseño', 'Producción', 'Tránsito', 'Entregado'])
})
