// lib/automatizaciones.js — Config de automatizaciones del inbox (por cuenta).
// Vive en Supabase (inbox.automatizaciones, una fila por cuenta, columna config jsonb).
// SOLO server-side. Pensado para ir sumando reglas sin migraciones: todo es JSON.
import { getSupabase, CUENTA, supabaseConfigurado } from './supabase.js'

// Defaults si la fila/campo no existe todavía. Los saludos arrancan APAGADOS.
export const DEFAULTS = {
  saludo_nuevo: {
    activo: false,
    texto: '¡Hola! 🧡 Bienvenid@ a Mandarina. Cuéntame, ¿qué estás buscando? Con gusto te ayudo 😊',
  },
  saludo_reactivacion: {
    activo: false,
    horas: 12,
    texto: '¡Hola de nuevo! 🧡 Qué gusto tenerte por aquí otra vez. ¿En qué puedo ayudarte hoy?',
  },
  // CORTAFUEGOS de IND AGENT, uno por número. Llave = id LOGICO del canal
  // (lib/canales.js), no el phone_id: el phone_id cambia si el número se migra de
  // cuenta y el interruptor quedaría huérfano.
  //
  // Booleano plano y no {activo}: merge() es de UN nivel, así que un patch anidado
  // borraría los hermanos (la mina que ya documenta el handoff para
  // seguimientos.caliente).
  //
  // Arranca PRENDIDO a propósito: a diferencia de los saludos y seguimientos —que
  // arrancan apagados porque MANDAN mensajes nuevos— esto solo deja de bloquear.
  // Si arrancara apagado, el deploy mataría el bot en silencio.
  ia: { principal: true, secundario: true },
}

// Merge superficial por bloque (no pisa un bloque entero si el patch trae solo un campo).
export function merge(base, patch) {
  const out = { ...base }
  for (const k of Object.keys(patch || {})) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
      out[k] = { ...(base?.[k] || {}), ...patch[k] }
    } else {
      out[k] = patch[k]
    }
  }
  return out
}

/** Lee la config de la cuenta, ya fusionada con los defaults. Nunca lanza. */
export async function getAutomatizaciones() {
  if (!supabaseConfigurado()) return { ...DEFAULTS }
  try {
    const sb = getSupabase()
    const { data } = await sb.from('automatizaciones').select('config').eq('cuenta', CUENTA).maybeSingle()
    return merge(DEFAULTS, data?.config || {})
  } catch (e) {
    console.error('[automatizaciones] lectura falló:', e.message)
    return { ...DEFAULTS }
  }
}

/** Guarda un patch (merge sobre lo existente). Devuelve la config resultante. */
export async function setAutomatizaciones(patch) {
  const sb = getSupabase()
  const actual = await getAutomatizaciones()
  const nueva = merge(actual, patch || {})
  const { error } = await sb
    .from('automatizaciones')
    .upsert({ cuenta: CUENTA, config: nueva, updated_at: new Date().toISOString() }, { onConflict: 'cuenta' })
  if (error) throw error
  return nueva
}
