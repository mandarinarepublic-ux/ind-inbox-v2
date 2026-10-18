// Lógica PURA de la pantalla 🧠 INDI (components/indi/*): fechas, promos
// vencidas, cómo se lee el historial y el historial que se manda al probar.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// 'YYYY-MM-DD' → '1 oct 2026'. Se arma a mano y NO con new Date(): una fecha sola
// leída como UTC se muestra el día anterior en Ecuador.
export function fechaCorta(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''))
  if (!m) return String(f ?? '')
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] || m[2]} ${m[1]}`
}

// `vencida` la calcula el servidor con la fecha de Ecuador (GET /api/indi/conocimiento).
export function avisoVencida(fila) {
  if (!fila?.vencida || !fila.vigente_hasta) return ''
  return `venció el ${fechaCorta(fila.vigente_hasta)}`
}

export function accionHistorial(fila) {
  if (!fila?.antes) return 'Creó'
  if (!fila?.despues) return 'Borró'
  return 'Cambió'
}

const TABLAS = {
  indi_conocimiento: 'Lo que sabe Indi',
  indi_feriados: 'Feriados',
  respuestas_rapidas: 'Respuestas rápidas',
}
export function nombreTabla(t) {
  return TABLAS[t] || t
}

// Chat de prueba → formato del agente [{ role, content }]. Los avisos de la
// pantalla no son parte de la conversación y un content vacío lo rechaza el modelo.
export function historialParaAgente(chat) {
  return (Array.isArray(chat) ? chat : [])
    .filter((m) => (m?.de === 'cliente' || m?.de === 'indi') && String(m.texto || '').trim())
    .map((m) => ({ role: m.de === 'cliente' ? 'user' : 'assistant', content: String(m.texto).trim() }))
}

// El servidor manda un solo mensaje (lib/indi-validar.js); se coloca junto al
// campo que lo causó. Lo que no es de un campo va arriba del formulario.
export function campoDelError(msg) {
  const m = String(msg || '').toLowerCase()
  if (m.includes('título')) return 'titulo'
  if (m.includes('contenido')) return 'contenido'
  if (m.includes('precio')) return 'precio'
  if (m.includes('fecha de fin')) return 'vigente_hasta'
  if (m.includes('nombre')) return 'nombre'
  if (m.includes('fecha')) return 'fecha'
  return 'general'
}

const COLUMNAS_DE_CONTROL = ['id', 'cuenta', 'actualizado_por', 'actualizado_en']

// Qué columnas cambió una fila del historial (sin las que pone el servidor solo).
export function cambiosDeFila(fila) {
  const antes = fila?.antes || {}
  const despues = fila?.despues || {}
  const cols = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .filter((c) => !COLUMNAS_DE_CONTROL.includes(c))
  return cols
    .filter((c) => JSON.stringify(antes[c] ?? null) !== JSON.stringify(despues[c] ?? null))
    .map((c) => ({ col: c, antes: antes[c] ?? null, despues: despues[c] ?? null }))
}

export function tituloDeCambio(fila) {
  const f = fila?.despues || fila?.antes || {}
  if (f.titulo) return f.titulo
  if (f.nombre && f.fecha) return `${f.nombre} (${fechaCorta(f.fecha)})`
  if (f.texto) {
    const t = String(f.texto).replace(/\s+/g, ' ').trim()
    return t.length > 40 ? `${t.slice(0, 40)}…` : t
  }
  return String(fila?.fila_id ?? '')
}
