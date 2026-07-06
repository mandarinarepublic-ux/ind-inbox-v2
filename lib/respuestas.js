import { readSheet, appendRow, findRowByValue, updateRow } from './sheets.js'

// RESPUESTAS_RAPIDAS IND: A=ID B=Texto C-L=ImagenURL 1-10
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
  }
}

export async function getRespuestas() {
  const rows = await readSheet('RESPUESTAS_RAPIDAS')
  return rows
    .filter(r => r[0] && r[1] && r[0] !== 'ID')
    .map(mapRespuestaRow)
}

export async function addRespuesta(id, texto, imagenUrl, extras = {}) {
  await appendRow('RESPUESTAS_RAPIDAS', [
    id, texto,
    imagenUrl || '',
    extras.imagenUrl2 || '', extras.imagenUrl3 || '', extras.imagenUrl4 || '',
    extras.imagenUrl5 || '', extras.imagenUrl6 || '', extras.imagenUrl7 || '',
    extras.imagenUrl8 || '', extras.imagenUrl9 || '', extras.imagenUrl10 || '',
  ])
  return { ok: true }
}

export async function editRespuesta(id, texto, imagenUrl, extras = {}) {
  const found = await findRowByValue('RESPUESTAS_RAPIDAS', 0, id)
  if (!found) throw new Error(`Respuesta no encontrada: ${id}`)
  await updateRow('RESPUESTAS_RAPIDAS', found.rowNumber, [
    id, texto,
    imagenUrl || '',
    extras.imagenUrl2 || '', extras.imagenUrl3 || '', extras.imagenUrl4 || '',
    extras.imagenUrl5 || '', extras.imagenUrl6 || '', extras.imagenUrl7 || '',
    extras.imagenUrl8 || '', extras.imagenUrl9 || '', extras.imagenUrl10 || '',
  ])
  return { ok: true }
}

export async function deleteRespuesta(id) {
  const found = await findRowByValue('RESPUESTAS_RAPIDAS', 0, id)
  if (!found) throw new Error(`Respuesta no encontrada: ${id}`)
  await updateRow('RESPUESTAS_RAPIDAS', found.rowNumber, [id, '', '', '', '', '', '', '', '', '', '', ''])
  return { ok: true }
}
