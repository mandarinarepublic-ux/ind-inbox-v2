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

// Pasa el chat a una persona: PRIMERO apaga la IA (que no vuelva a contestar) y
// luego avisa; cada paso con su catch para que uno que falle no salte al otro.
export async function pasarAPersona({ telefono, nota, updateModoIA, derivarAPersona, log = console.error }) {
  try { await updateModoIA(telefono, 'HUMANO') }
  catch (e) { log('[webhook IA] no pude apagar la IA:', e?.message) }
  try { await derivarAPersona(telefono, nota) }
  catch (e) { log('[webhook IA] no pude derivar:', e?.message) }
}

// Respaldo del traspaso: Indi llamó escalar_a_soporte (escalarPedido, o un
// `motivo` de un agente viejo) pero el PATCH del agente al inbox NO se hizo
// (escalado !== true). Devuelve la nota 🧠 para pasarAPersona, o null si no hay
// nada pendiente. Si el agente sí traspasó, su camino ya dejó el aviso.
export function traspasoPendiente(data) {
  const motivo = String(data?.motivo || '').trim()
  const pidio = data?.escalarPedido === true || motivo.length > 0
  if (!pidio || data?.escalado === true) return null
  return '🧠 ' + (motivo || 'Indi pidió pasar el chat')
}
