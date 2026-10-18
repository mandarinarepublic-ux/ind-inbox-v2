// Qué mandar al cliente con lo que devolvió el agente (Indi). PURO.
//  · `sinBase:true` → Indi no pudo leer su base: no se manda nada, se deriva.
//  · `imagenes` es arreglo (agente nuevo) → son esas, y el texto va sin URLs de imagen.
//  · si no (agente viejo) → las fotos se sacan de las URLs del texto.
const RE_IMG = /https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)]*)?/gi

const limpiar = (t) => t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

export function enviosDeRespuesta(data) {
  if (data?.sinBase === true) return { texto: '', imagenes: [], derivar: true }
  const reply = String(data?.reply_clean || data?.reply || '').trim()
  let imagenes
  if (Array.isArray(data?.imagenes)) {
    imagenes = [...new Set(data.imagenes.map((u) => String(u || '').trim()).filter(Boolean))]
  } else {
    imagenes = [...new Set(reply.match(RE_IMG) || [])]
  }
  // En los dos casos el texto no lleva URLs de imagen (la foto va aparte).
  const texto = limpiar(reply.replace(RE_IMG, ''))
  return { texto, imagenes, derivar: false }
}
