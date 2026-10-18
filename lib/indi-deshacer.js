// Arma la operación que revierte una fila de `inbox.indi_historial`. PURA: la
// ruta la ejecuta. El propio deshacer queda en el historial porque el trigger
// de la base se dispara con cualquier escritura.
//
// `antes` null  => fue un alta        => borrar
// `despues` null => fue un borrado    => reinsertar `antes`
// los dos        => fue una edición   => restaurar SOLO las columnas que ese
//                   cambio tocó (y que se pueden editar). Restaurar la fila
//                   entera pisaría ediciones posteriores de otras columnas.
//
// respuestas_rapidas es una tabla compartida con el resto del inbox: solo se
// restauran `uso_ia` y el contenido, y un alta o un borrado NO se deshacen.

const EDITABLES = {
  respuestas_rapidas: ['texto', 'grupo', 'imagenes', 'uso_ia'],
  indi_conocimiento: ['tipo', 'titulo', 'contenido', 'precio', 'vigente_hasta', 'activo', 'orden'],
}

// Igualdad profunda para valores de jsonb (arrays como `imagenes`, objetos).
function igual(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => k in b && igual(a[k], b[k]))
}

function columnasCambiadas(tabla, antes, despues) {
  const datos = {}
  for (const c of EDITABLES[tabla]) {
    if (!igual(antes[c] ?? null, despues[c] ?? null)) datos[c] = antes[c] ?? null
  }
  return datos
}

// Si `datos` queda vacío en un 'restaurar', no hay nada que deshacer.
export function operacionDeshacer(fila) {
  if (!fila || (!fila.antes && !fila.despues)) return null
  const { tabla, fila_id: id, antes, despues } = fila

  if (tabla === 'respuestas_rapidas') {
    if (!antes || !despues) return null
    return { tabla, tipo: 'restaurar', id, datos: columnasCambiadas(tabla, antes, despues) }
  }

  let clave
  if (tabla === 'indi_conocimiento') clave = { id }
  else if (tabla === 'indi_feriados') clave = { fecha: id }
  else return null

  if (!antes) return { tabla, tipo: 'borrar', ...clave, datos: null }
  if (!despues) return { tabla, tipo: 'reinsertar', ...clave, datos: antes }
  const datos = tabla === 'indi_conocimiento' ? columnasCambiadas(tabla, antes, despues) : antes
  return { tabla, tipo: 'restaurar', ...clave, datos }
}
