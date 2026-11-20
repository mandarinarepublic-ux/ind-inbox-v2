// lib/ia-motivo.js — ¿Por qué la IA NO va a responder un chat que dice PRENDIDA?
//
// 20-nov-2026 (port de MANDI): el botón 🤖 del chat solo es UNA de las rejas que
// deciden si Indi contesta. En IND hay CUATRO, en el mismo orden que el webhook
// (`agenteResponde` = IA_ON && decidirIA):
//   1. interruptor maestro IA_AUTORESPUESTA (variable de Vercel, toda la cuenta);
//   2. cortafuegos por NÚMERO (config.ia, 👋 AUTOS);
//   3. contacto 🏷️ Interno o 🤫 Sin automáticos (contactoCallado);
//   4. el botón del chat.
// Si 1-3 bloquean, el chat podía decir "IA PRENDIDA" y nadie respondía.
//
// Devuelve null cuando no hay nada que avisar. Ante la duda (dato sin cargar) NO
// avisa: un aviso falso enseña a ignorar el aviso.
//
// Módulo PURO: se prueba sin red ni base.
import { iaActivaEnCanal, contactoCallado } from './ia-canal.js'

/**
 * @param {{ iaChat:boolean, maestro?:boolean|null, config?:object|null, phoneId?:string,
 *           etiquetaCanal?:string, contacto?:object }} a
 * @returns {null | { corto:string, largo:string }}
 */
export function motivoIASinResponder({ iaChat, maestro = null, config, phoneId, etiquetaCanal = '', contacto } = {}) {
  if (!iaChat) return null                       // APAGADA ya se explica sola
  if (maestro === false) {
    return {
      corto: 'IA apagada en toda la cuenta',
      largo: 'La IA NO va a responder: el interruptor general (IA_AUTORESPUESTA en Vercel) está apagado para TODA la cuenta.',
    }
  }
  if (config && phoneId && !iaActivaEnCanal(config, phoneId)) {
    const n = etiquetaCanal ? ` ${etiquetaCanal}` : ''
    return {
      corto: `IA apagada en el número${n}`,
      largo: `La IA NO va a responder: está apagada para todo el número${n} en AUTOS. Préndela ahí o responde tú.`,
    }
  }
  if (contacto?.tipoContacto === 'interno') {
    return { corto: 'Contacto interno', largo: 'La IA NO va a responder: el chat está marcado 🏷️ Interno. Quita la marca si es cliente.' }
  }
  if (contactoCallado(contacto)) {
    return { corto: 'Sin automáticos 🤫', largo: 'La IA NO va a responder: el chat tiene 🤫 Sin automáticos. Quítalo para que Indi conteste.' }
  }
  return null
}
