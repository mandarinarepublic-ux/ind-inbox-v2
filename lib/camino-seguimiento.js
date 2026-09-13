// lib/camino-seguimiento.js — ¿Qué hace el cron de seguimientos con este chat?
//
// Antes el cron decidía con `seg.solo_ia_apagada && c.modoIA === true`, que mira
// el interruptor por CHAT y no el cortafuegos por NÚMERO. Y resulta que TODOS los
// chats nacían con IA prendida (el default de la columna, medido 13-sep-2026:
// 1.048 de 1.055 en 14 días), así que con el bot apagado en el AUTO el cron igual
// se saltaba a todo el mundo creyendo que "lo maneja el bot". Nadie recibía nada.
//
// La decisión correcta es la MISMA que usa el webhook para contestar
// (`decidirIA`): cortafuegos por número primero, chat después. Si el bot no va a
// contestar ese chat, el seguimiento sale. Si sí va a contestar, se deja en paz.
//
// A diferencia de MANDI, acá NO existe el camino 'despertar' (pedirle al agente
// que retome él la conversación): indx-agent no entiende el origen 'seguimiento'.
import { decidirIA } from './ia-canal.js'

/**
 * @returns {'texto'|'saltar'}
 *   'texto'  → mandar el mensaje automático de la regla
 *   'saltar' → el bot está activo en este chat; no hacer nada
 */
export function caminoDeSeguimiento({ config, contacto }) {
  const botActivo = decidirIA({ config, phoneId: contacto?.phoneId, contacto })
  return botActivo ? 'saltar' : 'texto'
}
