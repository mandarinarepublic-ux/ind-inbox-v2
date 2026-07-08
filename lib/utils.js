// ── AVATAR COLORS ────────────────────────────────────────────────
const COLORS = [
  '#10b981','#f59e0b','#6366f1','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316',
  '#3b82f6','#84cc16',
]

export const colorFor   = (phone) => COLORS[parseInt(phone.slice(-2) || '0') % COLORS.length]
export const initialsFor = (name)  => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

// ── DATE FORMATTING ──────────────────────────────────────────────
// Parsea ISO (2026-06-09T...), DD/MM/YYYY HH:mm y DD/MMM/YYYY HH:mm
// (mes en texto español, ej "07/jul/2026 11:55" — así lo escribe Make).
const MESES_ES = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,set:8,oct:9,nov:10,dic:11 }
export function parseDate(val) {
  if (!val) return new Date(NaN)
  const s = String(val).trim()
  // DD/MM/YYYY HH:mm (mes numérico)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
  // DD/MMM/YYYY HH:mm (mes en texto español)
  m = s.match(/^(\d{1,2})\/([A-Za-zÀ-ÿ]{3,})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (m) { const mes = MESES_ES[m[2].slice(0,3).toLowerCase()]; if (mes !== undefined) return new Date(+m[3], mes, +m[1], +m[4], +m[5]) }
  // ISO u otros formatos nativos
  return new Date(s)
}

// ── HASH DE WAMID (para citas / mensajes respondidos) ────────────
// El context.id (col L) del entrante y el id (col A) del citado son strings
// DISTINTOS aunque apunten al MISMO mensaje (Meta cambia el "envoltorio" del
// wamid según destinatario), pero el hash interno es idéntico. Comparamos por hash.
export function hashWamid(wamid) {
  const s = String(wamid || ''); if (!s.startsWith('wamid.')) return s
  try {
    let b64 = s.slice(6).replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad)
    const bin = atob(b64)                 // atob existe en navegador y en Node 18+
    const matches = bin.match(/[0-9A-F]{16,}/g)
    if (!matches || !matches.length) return s
    return matches.sort((a, b) => b.length - a.length)[0]  // hash = corrida hex más larga
  } catch { return s }
}

export function fmtTime(iso) {
  if (!iso) return ''
  const d    = parseDate(iso)
  const now  = new Date()
  const diff = (now - d) / 86_400_000
  if (diff < 1) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  if (diff < 2) return 'Ayer'
  if (diff < 7) return d.toLocaleDateString('es-MX', { weekday: 'short' })
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export function fmtDate(iso) {
  return parseDate(iso).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// ── BUILD CONVERSATIONS FROM FLAT ROWS ───────────────────────────
/**
 * Agrupa filas del Sheet en conversaciones por número de teléfono.
 * Devuelve array ordenado por último mensaje (más reciente primero).
 */
export function buildConvs(rows) {
  const map = {}

  rows.forEach(row => {
    const p = row.telefono
    if (!map[p]) map[p] = { telefono: p, nombre: row.nombre, msgs: [] }
    // Evitar duplicados por id
    if (!map[p].msgs.find(m => m.id === row.id)) {
      map[p].msgs.push(row)
    }
  })

  return Object.values(map)
    .map(conv => {
      const sorted = [...conv.msgs].sort(
        (a, b) => parseDate(a.timestamp) - parseDate(b.timestamp)
      )
      const last   = sorted[sorted.length - 1]
      const unread = sorted.filter(
        m => m.direccion === 'ENTRANTE' && m.estado === 'recibido'
      ).length
      return { ...conv, msgs: sorted, last, unread }
    })
    .sort((a, b) => parseDate(b.last.timestamp) - parseDate(a.last.timestamp))
}
