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
  // Seguimiento automático por TEMPERATURA del lead (Eje 2). Lo dispara el cron
  // (/api/cron/seguimientos, cada hora) según las horas de SILENCIO del cliente,
  // SIEMPRE dentro de la ventana de 24h de Meta (pasadas las 24h ya no se manda
  // gratis → plantilla, fase 2). Arranca TODO APAGADO: nada sale hasta que un
  // humano lo prenda en la pestaña AUTOS. Tope: 1 auto-envío por ventana por
  // contacto; se cancela solo si el cliente responde.
  //
  // `botones`: hasta 3 respuestas rápidas de WhatsApp ([{ title }], máx 20 letras
  // cada una). Con botones el mensaje sale como interactivo; sin ellos, texto
  // plano. Lo que el cliente toque entra al chat como texto y lo devuelve a
  // PENDIENTE — ningún botón dispara nada solo (regla del dueño, 13-sep-2026).
  seguimientos: {
    activo: false,          // interruptor global
    // 🔥 caliente: la pantalla te AVISA (⏰) a las alerta_horas; si no actúas, a las
    // "horas" el cron manda un "sujeta-ventana" para no perder las 24h.
    caliente: { activo: false, alerta_horas: 20, horas: 23, botones: [],
      texto: 'Hola 👋 ¿Seguimos con tu pedido? Estoy aquí para ayudarte a cerrarlo cuando quieras.' },
    // 🌤️ tibio: un seguimiento suave a media ventana.
    tibio:    { activo: false, horas: 12, botones: [],
      texto: '¡Hola! ¿Pudiste pensarlo? Cuéntame si te ayudo con algún modelo, color o el envío.' },
    // ❄️ frío: último toque antes de cerrar la ventana (opcional).
    frio:     { activo: false, horas: 22, botones: [],
      texto: '¡Hola! Pasaba a saludarte por si aún te interesa. Cualquier cosa, aquí estoy.' },
    // 📋 ENCUESTA DE REACTIVACIÓN (13-sep-2026): no depende de la temperatura.
    // Aplica a chats en ATENDIDO — contesté yo y el cliente se quedó callado —
    // a las `horas` de MI último mensaje, siempre con la ventana abierta. Al
    // salir, el chat pasa a la bandeja ENCUESTA; la respuesta lo devuelve a
    // PENDIENTES como cualquier entrante.
    encuesta: { activo: false, horas: 6,
      texto: '¡Hola! 👋 Te queremos hacer una preguntita rápida (30 segundos 🙏)\n\n¿Qué fue lo que te frenó para completar tu compra? Tu respuesta nos ayuda un montón… y de paso te devolvemos el favor con un 10% OFF para que la termines hoy 🎁',
      botones: [{ title: 'Es el precio' }, { title: 'Sigo pensándolo' }, { title: 'Otro motivo' }] },
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
    const { data, error } = await sb.from('automatizaciones').select('config').eq('cuenta', CUENTA).maybeSingle()
    // Supabase no lanza: devuelve {data, error}. Si se ignora el error, un bache
    // de Supabase se disfraza de "fila vacía" y esta función responde con los
    // DEFAULTS (ia prendida en los dos números) sin dejar rastro.
    if (error) {
      console.error('[automatizaciones] consulta con error, usando DEFAULTS (IA PRENDIDA):', error.message)
    }
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
