// lib/meta-ids.js — ÚNICA fuente de los identificadores de Meta.
//
// Estos IDs estaban copiados a mano en cuatro archivos. Cuando el número cambia
// de cuenta (migración entre WABAs) hay que tocarlos TODOS, y si se olvida uno
// falla en silencio: el envío se va al número viejo o directamente no sale.
// Peor aún, si alguien borra la variable de entorno, el valor viejo revive solo.
//
// Regla: nadie más define estos valores. Se importan de acá.
//
// Los defaults son el último estado conocido bueno, no un valor arbitrario:
// sirven para que un despliegue sin variables no quede muerto, pero SIEMPRE
// debe mandar la variable de entorno.
// 28-jul-2026: el número +593 99 995 3326 se movió a una WABA nueva. La anterior
// (IND STORE 1003593902536446) quedó en status ONBOARDING con divisa AED tras un
// cambio de socio y dejó de enviar: POST /messages devolvía HTTP 500 code=1
// durante 22 horas. Esa cuenta ya no existe.
export const META_PHONE_ID = process.env.META_PHONE_ID || '1153686904504422'
export const META_WABA_ID  = process.env.META_WABA_ID  || '1043571971409840'

// Negocio(s) donde buscar la WABA si hay que descubrirla. Ver lib/whatsapp.js.
export const NEGOCIOS_CONOCIDOS = (process.env.META_BUSINESS_ID || '114968056344676')
  .split(',').map(s => s.trim()).filter(Boolean)
