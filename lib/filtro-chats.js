// lib/filtro-chats.js — filtros combinables de la lista (diseño 2026-09-22 §4).
//
// Antes había UN filtro a la vez (una bandeja, o una temperatura, o "ventas").
// Ahora se combinan dimensiones: bandeja × temperatura × etapa × 📌 × 🎧 × ⏰ × interno.
//
// Trabaja sobre VISTAS ya preparadas (`prepararVista`) para no recalcular fechas
// miles de veces por render: IND tiene ~5.500 conversaciones y los conteos pasan
// por la lista una vez por opción.
//
// Módulo PURO.
import { temperaturaDe } from './temperatura.js'
import { alertaVentanaCierra, esperaCliente, ETAPAS } from './gestion.js'

export const FILTRO_INICIAL = Object.freeze({
  bandeja: 'pendiente', temp: '', etapa: '', deuda: false, ia: false, alerta: false, interno: false,
})

const DIMS_TEXTO = ['temp', 'etapa']
const DIMS_BOOL = ['deuda', 'ia', 'alerta', 'interno']

/** Lo mínimo que necesita el filtro, calculado una sola vez por chat y por minuto. */
export function prepararVista(c, ahoraMs = Date.now()) {
  return {
    telefono: c.telefono,
    estado: c.estado || 'pendiente',
    temp: temperaturaDe(c.ultimoEntranteAt, ahoraMs),
    etapa: c.etapa || '',
    deuda: Boolean(c.deudaAt),
    ia: Boolean(c.deudaAt) && c.deudaPor === 'ia',
    alerta: alertaVentanaCierra(c, ahoraMs),
    interno: c.tipoContacto === 'interno',
    espera: esperaCliente(c, ahoraMs),
  }
}

/** Clic en un chip: el mismo valor lo apaga (la bandeja vuelve a "todas"). */
export function alternar(f, dim, valor) {
  if (dim === 'bandeja') return { ...f, bandeja: f.bandeja === valor ? 'todas' : valor }
  if (DIMS_TEXTO.includes(dim)) return { ...f, [dim]: f[dim] === valor ? '' : valor }
  if (DIMS_BOOL.includes(dim)) return { ...f, [dim]: !f[dim] }
  return f
}

/** Los archivados solo aparecen si se pide ⚫ a propósito. */
export function pasaFiltro(v, f = FILTRO_INICIAL) {
  if (f.bandeja === 'archivado') { if (v.estado !== 'archivado') return false }
  else {
    if (v.estado === 'archivado') return false
    if (f.bandeja && f.bandeja !== 'todas' && v.estado !== f.bandeja) return false
  }
  if (f.temp && v.temp !== f.temp) return false
  if (f.etapa && v.etapa !== f.etapa) return false
  for (const d of DIMS_BOOL) if (f[d] && !v[d]) return false
  return true
}

/** Conteo por opción, respetando las OTRAS dimensiones activas (filtro facetado). */
export function conteos(vistas, f = FILTRO_INICIAL) {
  const con = (dim, valor) => {
    const g = { ...f, [dim]: valor }
    let n = 0
    for (const v of vistas) if (pasaFiltro(v, g)) n++
    return n
  }
  return {
    bandeja: { pendiente: con('bandeja', 'pendiente'), atendido: con('bandeja', 'atendido'), archivado: con('bandeja', 'archivado'), todas: con('bandeja', 'todas') },
    temp: Object.fromEntries(['caliente', 'tibio', 'frio', 'dormido'].map(t => [t, con('temp', t)])),
    etapa: Object.fromEntries(Object.keys(ETAPAS).map(e => [e, con('etapa', e)])),
    deuda: con('deuda', true), ia: con('ia', true), alerta: con('alerta', true), interno: con('interno', true),
  }
}

/** En 🔴, el que más espera va primero; el resto conserva su orden. */
export function ordenarPorEspera(vistas) {
  return [...vistas].sort((a, b) => (b.espera || 0) - (a.espera || 0))
}
