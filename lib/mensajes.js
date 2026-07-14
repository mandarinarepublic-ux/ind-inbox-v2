import { readSheet } from './sheets.js'
import { hashWamid } from './utils.js'
import { dualRead } from './supabase.js'
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

const telValido = (v) => String(v || '').replace(/\D/g, '').length >= 9

export async function getMensajes() {
  return dualRead(
    async () => {
      const rows = await readSheet('MENSAJES')
      // Fila 0 = headers, desde fila 1 son datos
      return rows
        .slice(1)
        // teléfono válido (≥9 dígitos, evita "0" y el literal 'Telefono')
        .filter(r => r[1] && r[1] !== 'Telefono' && telValido(r[1]))
        .map(mapMensajeRow)
        // sin mensajes 'system' ni vacíos (sin texto ni media ni botones) → evita chats fantasma
        .filter(m => String(m.tipo).toLowerCase() !== 'system' && (String(m.mensaje).trim() || String(m.mediaUrl).trim() || String(m.mediaId).trim() || String(m.botones).trim()))
    },
    () => SB.getMensajesSupabase(),
  )
}

// Busca un mensaje por wamid comparando por HASH (para citas fuera de la ventana de polling).
export async function getMensajeById(id) {
  return dualRead(
    async () => {
      if (!id) return null
      const rows = await readSheet('MENSAJES')
      const target = hashWamid(id)
      for (let i = rows.length - 1; i >= 0; i--) {
        if (hashWamid(rows[i][0]) === target) return mapMensajeRow(rows[i])
      }
      return null
    },
    () => SB.getMensajeByIdSupabase(id),
  )
}
