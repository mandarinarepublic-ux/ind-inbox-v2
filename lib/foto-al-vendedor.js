// Cuando el cliente manda una FOTO con Indi prendida, el chat pasa al vendedor
// (Indi no comenta fotos). En este repo conviven 'imagen' e 'image': ojo con los dos.
export function esFotoParaVendedor(m) {
  const t = m && m.tipo
  return t === 'imagen' || t === 'image'
}

// Lo mismo para todo medio que Indi no procesa: foto, audio, video o documento.
// Devuelve la nota para el vendedor, o null si el mensaje no se deriva.
// Tipos reales (lib/wa-mensaje.js): imagen, audio, video, documento; 'image' y
// 'document' por si llegan con el nombre de Meta.
const NOTA_DE_MEDIO = {
  imagen: '📷 Mandó una foto',
  image: '📷 Mandó una foto',
  audio: '🎤 Mandó un audio',
  video: '🎥 Mandó un video',
  documento: '📄 Mandó un documento',
  document: '📄 Mandó un documento',
}
export function medioParaVendedor(m) {
  const t = m && m.tipo
  return (t && Object.hasOwn(NOTA_DE_MEDIO, t)) ? NOTA_DE_MEDIO[t] : null
}
