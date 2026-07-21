import * as SB from './inbox-supabase.js'

// RESPUESTAS_RAPIDAS IND: A=ID B=Texto C-L=ImagenURL 1-10 M=Botones

export function mapRespuestaRow(row) {
  return {
    id:         String(row[0] || ''),
    text:       row[1] || '',
    imageUrl:   row[2] || '',
    imageUrl2:  row[3] || '',
    imageUrl3:  row[4] || '',
    imageUrl4:  row[5] || '',
    imageUrl5:  row[6] || '',
    imageUrl6:  row[7] || '',
    imageUrl7:  row[8] || '',
    imageUrl8:  row[9] || '',
    imageUrl9:  row[10] || '',
    imageUrl10: row[11] || '',
    botones:    String(row[12] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 3),
  }
}

export async function getRespuestas() {
  return SB.getRespuestasSupabase()
}

export async function addRespuesta(id, texto, imagenUrl, extras = {}) {
  return SB.addRespuestaSupabase(id, texto, imagenUrl, extras)
}

export async function editRespuesta(id, texto, imagenUrl, extras = {}) {
  return SB.editRespuestaSupabase(id, texto, imagenUrl, extras)
}

export async function deleteRespuesta(id) {
  return SB.deleteRespuestaSupabase(id)
}
