// Desde el 22-sep-2026 la señal humana de "venta en proceso" (InitiateCheckout)
// en IND es la etapa 💳/🛒, no 🔥 ni SOPORTE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { motivoPorEtapa } from '../lib/capi.js'

test('💳 y 🛒 cuentan como venta en proceso; 💬, 🔁 y vacío no', () => {
  assert.equal(motivoPorEtapa('esperando_pago'), 'esperando_pago')
  assert.equal(motivoPorEtapa('falta_pedido'), 'falta_pedido')
  assert.equal(motivoPorEtapa('cotizando'), null)
  assert.equal(motivoPorEtapa('postventa'), null)
  assert.equal(motivoPorEtapa(''), null)
  assert.equal(motivoPorEtapa(undefined), null)
})

test('revisarVentaEnProceso ya no lee temperatura ni la bandeja SOPORTE', () => {
  const fuente = readFileSync(new URL('../lib/capi.js', import.meta.url), 'utf8')
  const desde = fuente.indexOf('export async function revisarVentaEnProceso')
  const cuerpo = fuente.slice(desde, fuente.indexOf('\n}', desde))
  assert.ok(!/temperatura/.test(cuerpo), 'volvió a leer temperatura')
  assert.ok(!/SOPORTE/.test(cuerpo), 'volvió a leer SOPORTE')
})
