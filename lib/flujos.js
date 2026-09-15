// lib/flujos.js — FLUJOS: capa de servidor (Supabase + validación al publicar).
// Puerto desde MANDI (wa-inbox-next) el 15-sep-2026. Ver lib/flujo.js (el módulo
// puro) y lib/flujo-motor.js (correr una tanda).
//
// ⚠️ DIFERENCIA CON MANDI: acá NO hay importación de recetas. IND nunca tuvo
// "recetas de bienvenida", así que `planDeImportacion`/`importarRecetas` y la
// ruta /api/flujos/importar-recetas no existen en este repo.
//
// Importar este archivo no abre conexión: las funciones solo llaman a
// getSupabase() (perezoso, vía inbox-supabase.js) cuando de verdad corren.
import * as SB from './inbox-supabase.js'
import { validarFlujo, choquesDeDisparador } from './flujo.js'
import { getRespuestas } from './respuestas.js'

export async function getFlujos() {
  return SB.getFlujosSupabase()
}

export async function guardarFlujo({ flujo_id, nombre, grafo }) {
  return SB.guardarFlujoSupabase({ flujo_id, nombre, grafo })
}

export async function borrarFlujo(flujo_id) {
  return SB.borrarFlujoSupabase(flujo_id)
}

/**
 * publicar=true: valida el borrador (con las respuestas rápidas vivas) y lo cruza
 * contra el Disparador de los DEMÁS flujos publicados. Cualquier error → NO publica
 * y devuelve `{ ok:false, errores }`. publicar=false solo despublica (deja el borrador).
 */
export async function publicarFlujo(flujo_id, publicar) {
  if (!publicar) {
    return SB.setPublicadoFlujoSupabase(flujo_id, false)
  }

  const flujos = await SB.getFlujosSupabase()
  const fila = flujos.find((f) => String(f.flujo_id) === String(flujo_id))
  if (!fila) return { ok: false, errores: [{ texto: 'ese flujo ya no existe' }] }

  const respuestas = await getRespuestas()
  const errores = validarFlujo(fila.grafo, { respuestas })

  const publicados = await SB.getFlujosPublicadosSupabase()
  const otros = publicados.filter((f) => String(f.flujo_id) !== String(flujo_id))
  for (const choque of choquesDeDisparador(fila.grafo, otros)) {
    errores.push({ flujoId: choque.flujoId, texto: `choca con "${choque.nombre}" (${choque.motivo})` })
  }

  if (errores.length) return { ok: false, errores }

  await SB.setPublicadoFlujoSupabase(flujo_id, true)
  return { ok: true }
}

// ── Fase B: estado por cliente (el motor vive en lib/flujo-motor.js) ─────────
export async function getEstadoFlujo(telefono) { return SB.getFlujoEstadoSupabase(telefono) }
export async function guardarEstadoFlujo(fila) { return SB.setFlujoEstadoSupabase(fila) }
export async function borrarEstadoFlujo(telefono) { return SB.borrarFlujoEstadoSupabase(telefono) }
export async function getEstadosVencidos(ahoraIso, limite) { return SB.getFlujoEstadosVencidosSupabase(ahoraIso, limite) }
export async function borrarEstadosCaducados(ahoraIso) { return SB.borrarFlujoEstadosCaducadosSupabase(ahoraIso) }
export async function registrarPasos(args) { return SB.registrarPasosFlujoSupabase(args) }
export async function contarPasos(flujo_id, desdeIso) { return SB.contarPasosFlujoSupabase(flujo_id, desdeIso) }
