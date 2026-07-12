import { readSheet, updateCell, appendRow } from './sheets.js'

// Columnas de CONTACTOS:
// A=Telefono B=Nombre C=Alias D=Estado E=WaId F=? G=ModoIA H=IdVenta I=Notas J=Refuerzo1 K=Refuerzo2

export function mapContactRow(row) {
  return {
    telefono: String(row[0] || ''),
    nombre:   row[1] || '',
    alias:    row[2] || '',
    estado:   (row[3] || 'PENDIENTE').toLowerCase(),
    waId:     row[4] || '',
    modoIA:   (row[6] || 'IA').toUpperCase() !== 'HUMANO',
    idVenta:  String(row[7] || '').trim(),
    notas:    row[8] || '',
  }
}

export async function getContactos() {
  const rows = await readSheet('CONTACTOS')
  return rows
    .filter(r => r[0])
    .map(mapContactRow)
}

// ── Escritura tolerante en CONTACTOS ──────────────────────────────
// Match por SOLO dígitos (evita fallos por formato) y devuelve TODAS las filas
// del mismo teléfono (en CONTACTOS puede haber duplicados y el inbox indexa
// "última fila gana", así que hay que escribir en todas). Si no existe → upsert.
const soloDigitos = (s) => String(s || '').replace(/\D/g, '')

async function findContactoRows(telefono) {
  const rows = await readSheet('CONTACTOS')
  const obj = soloDigitos(telefono); if (!obj) return []
  const exactas = [], tolerantes = []
  for (let i = 0; i < rows.length; i++) {
    const cel = soloDigitos(rows[i][0]); if (!cel) continue
    if (cel === obj) exactas.push({ rowNumber: i + 1, values: rows[i] })
    else if (cel.endsWith(obj.slice(-9)) || obj.endsWith(cel.slice(-9))) tolerantes.push({ rowNumber: i + 1, values: rows[i] })
  }
  return exactas.length ? exactas : tolerantes
}

async function setContactoCell(telefono, colLetter, value) {
  const found = await findContactoRows(telefono)
  if (!found.length) {
    // upsert: crear fila con el teléfono en A y el valor en su columna
    const colIndex = colLetter.toUpperCase().charCodeAt(0) - 65
    const row = []
    for (let i = 0; i <= colIndex; i++) row[i] = i === 0 ? String(telefono) : (i === colIndex ? value : '')
    await appendRow('CONTACTOS', row)
    return { ok: true, creado: true }
  }
  // escribe en TODAS las filas duplicadas del mismo teléfono
  for (const f of found) await updateCell('CONTACTOS', f.rowNumber, colLetter, value)
  return { ok: true, filas: found.length }
}

// ── Upsert de contacto ENTRANTE (lo que antes hacía Make al recibir) ──────────
// Crea la fila si el teléfono no existe (Estado=PENDIENTE, ModoIA=IA). Si ya
// existe NO pisa datos manuales: solo rellena Nombre / WaId cuando están vacíos.
export async function registrarContactoEntrante(telefono, nombre, waId) {
  const found = await findContactoRows(telefono)
  if (!found.length) {
    // A=Telefono B=Nombre C=Alias D=Estado E=WaId F=? G=ModoIA
    await appendRow('CONTACTOS', [
      String(telefono), nombre || '', '', 'PENDIENTE', waId || '', '', 'IA',
    ])
    return { ok: true, creado: true }
  }
  const f = found[0]
  if (nombre && !String(f.values[1] || '').trim()) await updateCell('CONTACTOS', f.rowNumber, 'B', nombre)
  if (waId   && !String(f.values[4] || '').trim()) await updateCell('CONTACTOS', f.rowNumber, 'E', waId)
  // Un mensaje entrante regresa el contacto a PENDIENTE (lo que hacía Make).
  // No toca los ARCHIVADOS ni reescribe si ya está en PENDIENTE (ahorra writes).
  const estadoActual = String(f.values[3] || '').trim().toUpperCase()
  if (estadoActual !== 'ARCHIVADO' && estadoActual !== 'PENDIENTE') {
    for (const r of found) await updateCell('CONTACTOS', r.rowNumber, 'D', 'PENDIENTE')
  }
  return { ok: true, creado: false }
}

export async function updateEstado(telefono, estado)  { return setContactoCell(telefono, 'D', String(estado).toUpperCase()) }
export async function updateModoIA(telefono, modo)    { return setContactoCell(telefono, 'G', modo) } // 'IA' | 'HUMANO'
export async function updateNotas(telefono, notas)    { return setContactoCell(telefono, 'I', notas) }
export async function updateAlias(telefono, alias)    { return setContactoCell(telefono, 'C', alias) }
// Col H = IdVenta → se setea cuando se crea un pedido (botón CREAR PEDIDO).
export async function updateIdVenta(telefono, idVenta) { return setContactoCell(telefono, 'H', idVenta) }
