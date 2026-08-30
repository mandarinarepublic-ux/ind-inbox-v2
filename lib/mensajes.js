import * as SB from './inbox-supabase.js'

// Columnas MENSAJES:
// A=ID B=Telefono C=Nombre D=Tipo E=Contenido F=MediaURL G=Fecha H=Direccion
// I=MediaID J=RespuestaIA K=FotoIA L=ContextoID M=Botones (JSON [{id,title}])

export function mapMensajeRow(row) {
  return {
    id:             row[0] || '',
    telefono:       String(row[1] || ''),
    nombre:         row[2] || String(row[1] || '') || 'Sin nombre',
    tipo:           row[3] || 'texto',
    mensaje:        row[4] || '',
    mediaUrl:       row[5] || '',
    timestamp:      row[6] || '',
    direccion:      row[7] || 'ENTRANTE',
    mediaId:        row[8] || '',
    respuestaIA:    row[9] || '',
    imagenProducto: row[10] || '',
    contextoId:     row[11] || '',
    botones:        row[12] || '',  // col M — botones interactivos que enviamos (JSON)
  }
}

// `canal` = phone_id del número cuya bandeja se está mirando. Sin él, el
// principal (ver lib/inbox-supabase.js).
export async function getMensajes(canal) {
  return SB.getMensajesSupabase(undefined, canal)
}

// Historial COMPLETO de un chat.
export async function getHilo(telefono, limite = 800, canal, antesDe = '') {
  return SB.getHiloSupabase(telefono, limite, canal, antesDe)
}

// Lista lateral: último mensaje de cada conversación (todo el historial).
export async function getLista(canal) {
  return SB.getListaSupabase(undefined, canal)
}

// Búsqueda de texto en todo el historial.
export async function buscarMensajes(q, limite = 300) {
  return SB.buscarMensajesSupabase(q, limite)
}

// Busca un mensaje por wamid comparando por HASH (para citas fuera de la ventana de polling).
export async function getMensajeById(id) {
  return SB.getMensajeByIdSupabase(id)
}
