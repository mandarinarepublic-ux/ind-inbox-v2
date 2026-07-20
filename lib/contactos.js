import { readSheet, updateCell, appendRow } from './sheets.js'
import { dualRead, dualWrite } from './supabase.js'
import * as SB from './inbox-supabase.js'

// Columnas de CONTACTOS:
// A=Telefono B=Nombre C=Alias D=Estado E=WaId F=? G=ModoIA H=IdVenta I=Notas J=Refuerzo1 K=Refuerzo2 L=Temperatura

export function mapContactRow(row) {
  return {
    telefono: String(row[0] || ''),
    nombre:   row[1] || '',
    alias:    row[2] || '',
    // Normaliza el estado: quita espacios (incl. no-rompibles) y baja a minúsculas.
    // Sin esto, una celda como "SOPORTE " no coincidía con el filtro y el caso "desaparecía".
    estado:   (String(row[3] || '').replace(/[\s ]+/g, ' ').trim().toLowerCase() || 'pendiente'),
    waId:     row[4] || '',
    modoIA:   (row[6] || 'IA').toUpperCase() !== 'HUMANO',
    idVenta:  String(row[7] || '').trim(),
    notas:    row[8] || '',
    // Eje 2: temperatura del lead (col L). '' = sin clasificar.
    temperatura: String(row[11] || '').trim().toLowerCase(),
  }
}

export async function getContactos() {
  return dualRead(
    async () => {
      const rows = await readSheet('CONTACTOS')
      return rows
        .filter(r => r[0])
        .map(mapContactRow)
    },
    () => SB.getContactosSupabase(),
  )
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
// Crea la fila si el teléfono no existe (Estado=PENDIENTE, ModoIA=HUMANO → IA
// APAGADA por defecto). Si ya existe NO pisa datos manuales: solo rellena
// Nombre / WaId cuando están vacíos.
export async function registrarContactoEntrante(telefono, nombre, waId) {
  return dualWrite(
    () => registrarContactoEntranteSheets(telefono, nombre, waId),
    () => SB.registrarContactoEntranteSupabase(telefono, nombre, waId),
    'contacto.entrante',
  )
}

async function registrarContactoEntranteSheets(telefono, nombre, waId) {
  const found = await findContactoRows(telefono)
  if (!found.length) {
    // A=Telefono B=Nombre C=Alias D=Estado E=WaId F=? G=ModoIA
    await appendRow('CONTACTOS', [
      String(telefono), nombre || '', '', 'PENDIENTE', waId || '', '', 'HUMANO',
    ])
    return { ok: true, creado: true }
  }
  const f = found[0]
  if (nombre && !String(f.values[1] || '').trim()) await updateCell('CONTACTOS', f.rowNumber, 'B', nombre)
  if (waId   && !String(f.values[4] || '').trim()) await updateCell('CONTACTOS', f.rowNumber, 'E', waId)
  // Un entrante REABRE solo si estaba 'atendido' → PENDIENTE (necesita atención).
  // No toca soporte/archivado/venta: son estados deliberados (igual que WA INBOX V2).
  const estadoActual = String(f.values[3] || '').trim().toUpperCase()
  if (estadoActual === 'ATENDIDO') {
    for (const r of found) await updateCell('CONTACTOS', r.rowNumber, 'D', 'PENDIENTE')
  }
  return { ok: true, creado: false }
}

export async function updateEstado(telefono, estado) {
  return dualWrite(() => setContactoCell(telefono, 'D', String(estado).toUpperCase()),
    () => SB.updateEstadoSupabase(telefono, estado), 'contacto.estado')
}
export async function updateModoIA(telefono, modo) { // 'IA' | 'HUMANO'
  return dualWrite(() => setContactoCell(telefono, 'G', modo),
    () => SB.updateModoIASupabase(telefono, modo), 'contacto.modoIA')
}
// modoIA del contacto (gate del webhook para la auto-respuesta IA).
// Sin contacto → HUMANO (IA apagada). Respeta DATA_BACKEND vía getContactos().
export async function getModoIA(telefono) {
  const t9 = String(telefono || '').replace(/\D/g, '').slice(-9)
  const cs = await getContactos()
  const c = cs.find(x => String(x.telefono || '').replace(/\D/g, '').slice(-9) === t9)
  return c ? c.modoIA : false
}
export async function updateNotas(telefono, notas) {
  return dualWrite(() => setContactoCell(telefono, 'I', notas),
    () => SB.updateNotasSupabase(telefono, notas), 'contacto.notas')
}
export async function updateAlias(telefono, alias) {
  return dualWrite(() => setContactoCell(telefono, 'C', alias),
    () => SB.updateAliasSupabase(telefono, alias), 'contacto.alias')
}
// Col H = IdVenta → se setea cuando se crea un pedido (botón CREAR PEDIDO).
export async function updateIdVenta(telefono, idVenta) {
  return dualWrite(() => setContactoCell(telefono, 'H', idVenta),
    () => SB.updateIdVentaSupabase(telefono, idVenta), 'contacto.idVenta')
}
// Col L = Temperatura del lead (Eje 2). Manual 100%. '' / null limpia la clasificación.
export async function updateTemperatura(telefono, temperatura) {
  const val = temperatura ? String(temperatura).toLowerCase() : ''
  return dualWrite(() => setContactoCell(telefono, 'L', val),
    () => SB.updateTemperaturaSupabase(telefono, val), 'contacto.temperatura')
}
// Tracking del cron de seguimientos. Solo Supabase (Sheets no tiene estas columnas).
export async function marcarSeguimiento(telefono, ts = null) {
  if (typeof SB.marcarSeguimientoSupabase !== 'function') return { ok: false }
  return SB.marcarSeguimientoSupabase(telefono, ts)
}
export async function marcarAlertaVentana(telefono, ts = null) {
  if (typeof SB.marcarAlertaVentanaSupabase !== 'function') return { ok: false }
  return SB.marcarAlertaVentanaSupabase(telefono, ts)
}
