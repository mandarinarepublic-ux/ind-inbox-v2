// lib/auth-maquina.js — la credencial con la que el servidor se llama a sí mismo.
//
// ☠️ Al encender el candado (`AUTH_MODO=bloquear`), toda llamada interna a
// `/api/saliente` quedó SIN credencial: esa ruta no es pública, así que empezó a
// devolver 401 y se murieron EN SILENCIO los envíos automáticos — los saludos
// (saludo_nuevo/saludo_reactivacion) y el cron de seguimientos.
//
// ⚠️ Corregido el 15-ago-2026: esta lista mencionaba "mensaje de espera" y
// "LINKPAGO" como si IND los tuviera. Eso era falso — IND nunca tuvo esas dos
// cosas (el "mensaje de espera" ante una foto es de MANDI; LINKPAGO por chat
// también). Un comentario que miente es justo la clase de bug que este
// proyecto viene peleando; se deja la mención a MANDI abajo porque el
// incidente SÍ fue en MANDI y sigue siendo la referencia útil.
//
// En MANDI pasó exactamente eso el 7-ago-2026 y tardó 7 días en verse: 4 LINKPAGO
// ese día, CERO del 8 en adelante. Fue invisible porque el `.catch` de entonces
// solo miraba errores de RED, y **un 401 no es un error de red**: `fetch` lo
// devuelve como una respuesta normal con `ok:false`. Por eso `enviarConMaquina`
// mira `res.ok` — sin eso, el próximo rechazo se vuelve a callar.
//
// Se limpia el valor porque el middleware compara LARGOS antes que contenido: un
// BOM invisible (los pega PowerShell al cargar variables) haría fallar la
// comparación sin explicar por qué.
const TOKEN = String(process.env.INBOX_API_TOKEN || '').replace(/[^\x21-\x7E]/g, '')

/** ¿Está configurada la llave de máquina? Sin ella no se manda cabecera. */
export function hayTokenMaquina() {
  return Boolean(TOKEN)
}

/**
 * Cabeceras para que el servidor se identifique ante su propio API.
 * Sin token devuelve solo el Content-Type: el comportamiento es el de antes,
 * así que se puede desplegar antes de configurar la variable sin empeorar nada.
 */
export function cabecerasMaquina(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...extra,
  }
}

/**
 * Un POST interno que NO se calla cuando lo rechazan. Nunca lanza: un fallo de
 * aviso no puede tumbar el webhook.
 */
export async function enviarConMaquina(url, cuerpo, etiqueta = 'envío automático') {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: cabecerasMaquina(),
      body: JSON.stringify(cuerpo),
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error(
        `[auth-maquina] ${etiqueta} rechazado: ${res.status}`,
        res.status === 401
          ? '— falta o no coincide INBOX_API_TOKEN'
          : detalle.slice(0, 200),
      )
    }
    return res
  } catch (e) {
    console.error(`[auth-maquina] ${etiqueta} falló por red:`, e?.message || e)
  }
}
