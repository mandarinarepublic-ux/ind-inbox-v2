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
  return SB.getContactosSupabase()
}

// ── Upsert de contacto ENTRANTE (lo que antes hacía Make al recibir) ──────────
// Crea la fila si el teléfono no existe (Estado=PENDIENTE, ModoIA=HUMANO → IA
// APAGADA por defecto). Si ya existe NO pisa datos manuales: solo rellena
// Nombre / WaId cuando están vacíos.
export async function registrarContactoEntrante(telefono, nombre, waId) {
  return SB.registrarContactoEntranteSupabase(telefono, nombre, waId)
}

export async function updateEstado(telefono, estado) {
  return SB.updateEstadoSupabase(telefono, estado)
}
export async function updateModoIA(telefono, modo) { // 'IA' | 'HUMANO'
  return SB.updateModoIASupabase(telefono, modo)
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
  return SB.updateNotasSupabase(telefono, notas)
}
export async function updateAlias(telefono, alias) {
  return SB.updateAliasSupabase(telefono, alias)
}
// Col H = IdVenta → se setea cuando se crea un pedido (botón CREAR PEDIDO).
export async function updateIdVenta(telefono, idVenta) {
  return SB.updateIdVentaSupabase(telefono, idVenta)
}
// Col L = Temperatura del lead (Eje 2). Manual 100%. '' / null limpia la clasificación.
export async function updateTemperatura(telefono, temperatura) {
  const val = temperatura ? String(temperatura).toLowerCase() : ''
  return SB.updateTemperaturaSupabase(telefono, val)
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
