// lib/canales.js — Los números de WhatsApp que atiende este inbox.
//
// ÚNICO lugar donde se define qué canales existen. La interfaz pinta un botón por
// cada uno y el backend filtra por `phoneId`. Agregar un número es agregar una
// entrada acá: nada más en la app sabe de números.
//
// El `id` es lógico a propósito y NO el número: el phone_id de Meta cambia si el
// número se migra de cuenta (nos está pasando ahora con el 3326), y no queremos
// que eso arrastre estado guardado en el navegador ni en las URLs.
import { META_PHONE_ID, META_WABA_ID } from './meta-ids.js'

export const CANALES = [
  {
    id: 'principal',
    phoneId: META_PHONE_ID,          // hoy 1153686904504422 (+593 99 995 3326, WABA recreada 28-jul)
    wabaId: META_WABA_ID,            // 1043571971409840
    etiqueta: '3326',
    titulo: 'IND STORE · +593 99 995 3326',
  },
  {
    id: 'secundario',
    phoneId: process.env.NEXT_PUBLIC_META_PHONE_ID_2 || '2241248862581450',
    // WABA propia, distinta a la del 3326. Confirmada contra el tráfico real de
    // inbox.webhook_eventos (entry[0].id), no contra una variable de entorno.
    wabaId: process.env.META_WABA_ID_2 || '396966121059860',
    etiqueta: '9804',
    titulo: 'Ind Store · +593 98 415 9804',
  },
]

export const CANAL_POR_DEFECTO = CANALES[0].id

/**
 * Cuántos mensajes del cliente hacen falta para avisarle a Meta (LeadSubmitted).
 *
 * IND se queda en 4. Genera 65 señales por semana con ese umbral, o sea que ya
 * pasa las ~50 que Meta necesita para aprender: bajarlo solo metería ruido sin
 * ganar nada. MANDARINA sí lo bajó a 3 porque con 4 se quedaba en 33.
 *
 * Vive acá y no en lib/capi.js porque ese archivo es IDÉNTICO en los dos inbox a
 * propósito: es lo que permite ver de un vistazo si se desincronizaron.
 * `CAPI_LEAD_UMBRAL` en Vercel lo sigue pisando si hace falta moverlo sin
 * desplegar.
 */
export const LEAD_UMBRAL_DEFECTO = 4

/** id lógico → phone_id de Meta. Devuelve el principal si el id no existe. */
export function phoneIdDeCanal(id) {
  const c = CANALES.find((x) => x.id === id)
  return (c || CANALES[0]).phoneId
}

/** phone_id de Meta → id lógico (para etiquetar lo que llega del backend). */
export function canalDePhoneId(phoneId) {
  const c = CANALES.find((x) => String(x.phoneId) === String(phoneId))
  return c ? c.id : null
}

/**
 * waba_id de Meta → etiqueta legible del canal (p.ej. '9804').
 *
 * Los eventos a nivel CUENTA (account_update) NO traen phone_id: llegan colgados
 * del WABA (entry[0].id). Es el único identificador que tenemos para decir en la
 * alerta CUÁL número se cayó. Devuelve null si el WABA no es de ninguno de
 * nuestros canales — la alerta igual sale, con el id crudo.
 */
export function etiquetaDeWabaId(wabaId) {
  const c = CANALES.find((x) => String(x.wabaId) === String(wabaId))
  return c ? c.etiqueta : null
}

/**
 * phone_id de Meta → WABA que lo aloja.
 *
 * La Conversions API exige `whatsapp_business_account_id` en los eventos de
 * business_messaging, y tiene que ser la WABA por la que ENTRÓ el click, no "la
 * WABA de la marca": cada número está en una WABA distinta. Devuelve null si el
 * phone_id no es de ninguno de nuestros canales — mejor no mandar el evento que
 * mandarlo con una WABA equivocada, que Meta rechaza igual.
 */
export function wabaIdDePhoneId(phoneId) {
  const c = CANALES.find((x) => String(x.phoneId) === String(phoneId))
  return c?.wabaId || null
}
