// ⚠️ COPIA EXACTA de MANDARINACRM/lib/etapaCliente.js (18-oct-2026). Si cambias uno, cambia el otro: Indi y la página /pedido tienen que decir lo mismo.
// ⚠️ ETAPAS_CLIENTE[4].mensaje dice "Mandarina": Indi usa solo `nombre`, nunca `mensaje`.
// lib/etapaCliente.js
//
// En qué ETAPA ve el cliente su pedido: la página pública /pedido y, en la
// Fase 2, los mensajes de WhatsApp. Puro: sin base, sin red, sin '@/'.
//
// Regla acordada con Rodrigo el 9-oct-2026 (spec 2026-10-09-seguimiento-…):
//   Recibido   el pedido existe
//   Diseño     se imprimió la hoja para producción
//   Producción se cortó, o un área lo tiene EN_PROCESO / LISTO, o está en DESPACHO
//              (ENVIADO_APROBACION = arte mandado al cliente: sigue en Diseño)
//   Tránsito   COMPLETADO, o ya hay guía de despacho (aunque nadie haya cerrado el
//              pedido en el CRM: decisión de Rodrigo el 9-oct-2026)
//   Entregado  ENTREGADO, o 24 h después de Tránsito (calculado, no se guarda)
//
// Nunca retrocede: manda la etapa más avanzada que se cumpla.

import { parseSubestados } from './crm-subestados.js'

export const ETAPAS_CLIENTE = Object.freeze([
  { nombre: 'Recibido',   mensaje: 'Recibimos tu pedido y ya está en la fila del taller.' },
  { nombre: 'Diseño',     mensaje: 'Estamos preparando el diseño de tus prendas.' },
  { nombre: 'Producción', mensaje: 'Tus prendas están en producción: corte, estampado y costura.' },
  { nombre: 'Tránsito',   mensaje: 'Tu pedido va en camino.' },
  { nombre: 'Entregado',  mensaje: '¡Tu pedido fue entregado! Gracias por confiar en Mandarina.' },
])

export const HORAS_HASTA_ENTREGADO = 24

// ENTREGADO_TIENDA es una prenda de stock que no pasa por el taller: no cuenta.
const TRABAJO_DE_AREA = new Set(['EN_PROCESO', 'LISTO'])
const ESTADOS_PRODUCCION = new Set(['DESPACHO', 'COMPLETADO', 'ENTREGADO'])

const ms = (f) => {
  const t = f ? Date.parse(f) : NaN
  return Number.isNaN(t) ? null : t
}

function extremo(logs, pred, cual) {
  let r = null
  for (const l of logs) {
    if (!pred(l)) continue
    const t = ms(l.fecha)
    if (t == null) continue
    if (r == null || (cual === 'primera' ? t < r : t > r)) r = t
  }
  return r
}

const esLogDeProduccion = (l) => {
  const campo = String(l.campo || '')
  const despues = String(l.despues || '')
  if (campo.startsWith('CORTE') && despues === 'CORTADO') return true
  if (campo.startsWith('SUBESTADO') && /EN_PROCESO|LISTO/.test(despues)) return true
  return campo === 'ESTADO_PEDIDO' && despues === 'DESPACHO'
}

/**
 * @returns {{ etapa: 0|1|2|3|4|null, fechas: (string|null)[], cancelado: boolean }}
 */
export function calcularEtapa({ pedido, items = [], logs = [], guia = null, ahora = new Date() }) {
  const estado = String(pedido?.estado_pedido || '').toUpperCase()
  if (estado === 'CANCELADO') return { etapa: null, fechas: [null, null, null, null, null], cancelado: true }

  const vivos = items.filter((i) => !i.eliminado)
  const f = [null, null, null, null, null]

  f[0] = extremo(logs, (l) => l.campo === 'CREACION', 'primera') ?? ms(pedido?.fecha_pedido)
  f[1] = extremo(logs, (l) => l.campo === 'IMPRESION_PRODUCCION', 'primera') ?? ms(pedido?.fecha_impresion_produccion)
  f[2] = extremo(logs, esLogDeProduccion, 'primera')

  const enTaller = vivos.some((i) =>
    i.subestado_corte === 'CORTADO'
    || Object.values(parseSubestados(i.subestado, i.area)).some((v) => TRABAJO_DE_AREA.has(v)))
  // Si la bitácora ya registró trabajo del taller, se queda en Producción aunque
  // un área vuelva a ENVIADO_APROBACION: la etapa nunca retrocede en pantalla.
  const produccion = enTaller || ESTADOS_PRODUCCION.has(estado) || f[2] != null
  const cerrado = estado === 'COMPLETADO' || estado === 'ENTREGADO'
  const transito = cerrado || Boolean(guia?.numero)

  if (transito) {
    // Va en camino desde lo PRIMERO que lo diga: la guía o el paso a COMPLETADO.
    const desde = [
      ms(guia?.fecha),
      extremo(logs, (l) => l.campo === 'ESTADO_PEDIDO' && l.despues === 'COMPLETADO', 'ultima'),
    ].filter((t) => t != null)
    f[3] = desde.length ? Math.min(...desde) : cerrado ? ms(pedido?.fecha_actualizacion) : null
  }

  let entregado = false
  if (estado === 'ENTREGADO') {
    entregado = true
    f[4] = extremo(logs, (l) => l.campo === 'ESTADO_PEDIDO' && l.despues === 'ENTREGADO', 'ultima') ?? f[3]
  } else if (transito && f[3] != null) {
    const limite = f[3] + HORAS_HASTA_ENTREGADO * 3600 * 1000
    if (ahora.getTime() >= limite) { entregado = true; f[4] = limite }
  }

  const etapa = entregado ? 4 : transito ? 3 : produccion ? 2 : f[1] != null ? 1 : 0
  const fechas = f.map((t, k) => (k <= etapa && t != null ? new Date(t).toISOString() : null))
  return { etapa, fechas, cancelado: false }
}
