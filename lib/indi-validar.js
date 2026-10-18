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

// undefined = no vino (la base pone su valor por defecto). Del formulario o de
// una petición a mano pueden llegar como texto: 'true'/'false' y '3' se aceptan.
function aActivo(a) {
  if (a === undefined) return { ok: true, valor: undefined }
  if (a === true || a === 'true') return { ok: true, valor: true }
  if (a === false || a === 'false') return { ok: true, valor: false }
  return { ok: false }
}

function aOrden(o) {
  if (o === undefined) return { ok: true, valor: undefined }
  if (o === null || (typeof o === 'string' && !o.trim())) return { ok: true, valor: 0 }
  if (typeof o !== 'number' && (typeof o !== 'string' || !/^\s*\d+\s*$/.test(o))) return { ok: false }
  const n = Number(o)
  if (!Number.isInteger(n) || n < 0) return { ok: false }
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
  const activo = aActivo(fila.activo)
  if (!activo.ok) return { ok: false, error: 'El campo "Indi la usa" debe ser sí o no' }
  const orden = aOrden(fila.orden)
  if (!orden.ok) return { ok: false, error: 'El orden debe ser un número entero mayor o igual a 0' }

  const vigente = fila.vigente_hasta || null
  if (fila.tipo === 'promo') {
    if (!vigente) return { ok: false, error: 'La promo necesita una fecha de fin' }
    if (!fechaReal(vigente)) return { ok: false, error: 'La fecha de fin no es válida' }
    if (vigente < hoy) return { ok: false, error: 'La fecha de fin ya pasó' }
  } else if (vigente && !fechaReal(vigente)) {
    return { ok: false, error: 'La fecha de fin no es válida' }
  }

  // Solo columnas conocidas: `cuenta` y `actualizado_*` los pone el servidor.
  const limpia = { ...fila, tipo: fila.tipo, titulo, contenido, precio: precio.valor, vigente_hasta: vigente, activo: activo.valor, orden: orden.valor }
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

// Resultado de un update/delete/insert con `.select(...)` → respuesta HTTP. Sin
// filas tocadas NO es "ok": la fila ya no estaba (404, con `noHay`). Una clave
// repetida (Postgres 23505) al reponer algo es un 409 que se entiende.
export function resultadoEscritura({ data, error } = {}, noHay = 'Eso ya no existe') {
  if (error?.code === '23505') return { status: 409, body: { error: 'Ese registro ya existe: no hay nada que reponer' } }
  if (error) return { status: 500, body: { error: error.message || String(error) } }
  if (!Array.isArray(data) || !data.length) return { status: 404, body: { error: noHay } }
  return { status: 200, body: { ok: true } }
}
