// ⚠️ COPIA EXACTA de MANDARINACRM/lib/subestados.js (18-oct-2026): solo `parseSubestados` y su helper `areasDelItem`.
// Si cambias uno, cambia el otro: Indi y la página /pedido tienen que decir lo mismo.

const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

// Extraer las áreas base de un string de área combinada
// "ESTAMPADO + BORDADO" → ['ESTAMPADO', 'BORDADO']
function areasDelItem(areaStr) {
  if (!areaStr) return []
  const partes = areaStr.split(/\s*\+\s*|\s*,\s*/).map(a => a.trim().toUpperCase())
  return partes.filter(a => AREAS_BASE.includes(a))
}

// Parsear el campo SUBESTADO del Sheet → objeto {ESTAMPADO: 'LISTO', BORDADO: 'EN_PROCESO'}
// Si es formato simple "LISTO" → todas las áreas del ítem tienen ese valor
export function parseSubestados(subestadoStr, areaStr) {
  if (!subestadoStr) return {}
  const areas = areasDelItem(areaStr)

  // Formato multi: "ESTAMPADO:LISTO|BORDADO:EN_PROCESO"
  if (subestadoStr.includes(':')) {
    const result = {}
    subestadoStr.split('|').forEach(part => {
      const [area, estado] = part.split(':')
      if (area && estado) result[area.trim()] = estado.trim()
    })
    return result
  }

  // Formato simple (pedidos viejos): aplicar a todas las áreas
  if (areas.length === 0) return { _simple: subestadoStr }
  const result = {}
  areas.forEach(a => result[a] = subestadoStr)
  return result
}

