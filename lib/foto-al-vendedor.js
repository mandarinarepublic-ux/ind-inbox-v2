// Cuando el cliente manda una FOTO con Indi prendida, el chat pasa al vendedor
// (Indi no comenta fotos). En este repo conviven 'imagen' e 'image': ojo con los dos.
export function esFotoParaVendedor(m) {
  const t = m && m.tipo
  return t === 'imagen' || t === 'image'
}
