// Validación PURA de lo que se guarda en el módulo 🧠 INDI. Las mismas reglas
// están como `check` en la base (ver docs/indi/migracion-indi-entrenamiento.sql);
// acá se validan antes para devolver un mensaje claro en vez de un error de SQL.

export const TIPOS = ['precio', 'promo', 'regla', 'pregunta']
const COLUMNAS_EDITABLES = ['id', 'tipo', 'titulo', 'contenido', 'precio', 'vigente_hasta', 'activo', 'orden']

export function hoyEcuador(ahora = new Date()) {
  // en-CA da YYYY-MM-DD. Ecuador no tiene horario de verano.
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}

export function fechaReal(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

function aPrecio(p) {
  if (p === null || p === undefined || p === '') return { ok: true, valor: null }
  const n = typeof p === 'number' ? p : Number(String(p).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return { ok: false }
  return { ok: true, valor: n }
}

export function validarFila(fila, hoy = hoyEcuador()) {
  if (!fila || typeof fila !== 'object') return { ok: false, error: 'Falta la fila' }
  if (!TIPOS.includes(fila.tipo)) return { ok: false, error: 'Tipo no válido' }
  const titulo = String(fila.titulo ?? '').trim()
  if (titulo.length < 1 || titulo.length > 80) return { ok: false, error: 'El título debe tener entre 1 y 80 caracteres' }
  const contenido = String(fila.contenido ?? '')
  if (contenido.length > 1500) return { ok: false, error: 'El contenido pasa de 1500 caracteres' }
  const precio = aPrecio(fila.precio)
  if (!precio.ok) return { ok: false, error: 'El precio debe ser un número mayor o igual a 0' }

  const vigente = fila.vigente_hasta || null
  if (fila.tipo === 'promo') {
    if (!vigente) return { ok: false, error: 'La promo necesita una fecha de fin' }
    if (!fechaReal(vigente)) return { ok: false, error: 'La fecha de fin no es válida' }
    if (vigente < hoy) return { ok: false, error: 'La fecha de fin ya pasó' }
  } else if (vigente && !fechaReal(vigente)) {
    return { ok: false, error: 'La fecha de fin no es válida' }
  }

  // Solo columnas conocidas: `cuenta` y `actualizado_*` los pone el servidor.
  const limpia = { ...fila, tipo: fila.tipo, titulo, contenido, precio: precio.valor, vigente_hasta: vigente }
  const salida = {}
  for (const c of COLUMNAS_EDITABLES) if (limpia[c] !== undefined) salida[c] = limpia[c]
  return { ok: true, fila: salida }
}

export function validarFeriado({ fecha, nombre } = {}) {
  if (!fechaReal(fecha)) return { ok: false, error: 'La fecha no es válida' }
  const n = String(nombre ?? '').trim()
  if (n.length < 1 || n.length > 60) return { ok: false, error: 'El nombre debe tener entre 1 y 60 caracteres' }
  return { ok: true, fecha, nombre: n }
}
