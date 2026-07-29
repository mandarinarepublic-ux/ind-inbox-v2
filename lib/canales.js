// lib/canales.js — Los números de WhatsApp que atiende este inbox.
//
// ÚNICO lugar donde se define qué canales existen. La interfaz pinta un botón por
// cada uno y el backend filtra por `phoneId`. Agregar un número es agregar una
// entrada acá: nada más en la app sabe de números.
//
// El `id` es lógico a propósito y NO el número: el phone_id de Meta cambia si el
// número se migra de cuenta (nos está pasando ahora con el 3326), y no queremos
// que eso arrastre estado guardado en el navegador ni en las URLs.
import { META_PHONE_ID } from './meta-ids.js'

export const CANALES = [
  {
    id: 'principal',
    phoneId: META_PHONE_ID,          // hoy 1153686904504422 (+593 99 995 3326, WABA recreada 28-jul)
    etiqueta: '3326',
    titulo: 'IND STORE · +593 99 995 3326',
  },
  {
    id: 'secundario',
    phoneId: process.env.NEXT_PUBLIC_META_PHONE_ID_2 || '2241248862581450',
    etiqueta: '9804',
    titulo: 'Ind Store · +593 98 415 9804',
  },
]

export const CANAL_POR_DEFECTO = CANALES[0].id

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
