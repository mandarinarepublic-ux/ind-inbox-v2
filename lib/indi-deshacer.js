// Arma la operación que revierte una fila de `inbox.indi_historial`. PURA: la
// ruta la ejecuta. El propio deshacer queda en el historial porque el trigger
// de la base se dispara con cualquier escritura.
//
// `antes` null  => fue un alta        => borrar
// `despues` null => fue un borrado    => reinsertar `antes`
// los dos        => fue una edición   => restaurar `antes`
//
// respuestas_rapidas es una tabla compartida con el resto del inbox: solo se
// restaura `uso_ia` y el contenido, y un alta o un borrado NO se deshacen.

const CONTENIDO_RESPUESTA = ['texto', 'grupo', 'imagenes', 'uso_ia']

export function operacionDeshacer(fila) {
  if (!fila || (!fila.antes && !fila.despues)) return null
  const { tabla, fila_id: id, antes, despues } = fila

  if (tabla === 'respuestas_rapidas') {
    if (!antes || !despues) return null
    const datos = {}
    for (const c of CONTENIDO_RESPUESTA) if (c in antes) datos[c] = antes[c]
    return { tabla, tipo: 'restaurar', id, datos }
  }

  let clave
  if (tabla === 'indi_conocimiento') clave = { id }
  else if (tabla === 'indi_feriados') clave = { fecha: id }
  else return null

  if (!antes) return { tabla, tipo: 'borrar', ...clave, datos: null }
  if (!despues) return { tabla, tipo: 'reinsertar', ...clave, datos: antes }
  return { tabla, tipo: 'restaurar', ...clave, datos: antes }
}
