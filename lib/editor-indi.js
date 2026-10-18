// ¿Quién puede cambiar lo que sabe Indi? Solo admins activos con INDSTORE
// (hoy: Andrés y Xavier). Cualquier sesión válida puede LEER y probar.
import { COOKIE_SESION, verificarSesion, secretoSesion } from './sesion.js'

export const MSG_SOLO_DUENOS = 'Solo Rodrigo y Xavier pueden cambiar a Indi'

export function puedeEditarIndi(usuario) {
  return usuario?.activo === true
    && usuario?.rol === 'ADMIN'
    && (usuario?.tiendas || []).includes('INDSTORE')
}

// Lo que ve el navegador en /api/indi/permiso: si muestra los botones de guardar.
// Es solo para la pantalla; el candado de verdad es `autorizar` en cada POST.
export function permisoIndi(usuario) {
  return { puedeEditar: puedeEditarIndi(usuario), nombre: usuario?.nombre ?? null }
}

// La sesión firmada solo dice QUIÉN es; rol/tiendas/activo se releen de
// `crm.usuarios` en cada petición (mismo criterio que lib/acceso.js), para que
// quitarle el permiso a alguien surta efecto al instante.
// `cache: 'no-store'` es obligatorio: Next cachea el GET y congelaría el permiso.
export async function usuarioDeSesion(req) {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secretoSesion())
    if (!sesion?.id) return null
    const res = await fetch(
      `${url}/rest/v1/usuarios?usuario_id=eq.${encodeURIComponent(sesion.id)}`
      + `&select=usuario_id,nombre,rol,tiendas,activo&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'crm' }, cache: 'no-store' },
    )
    if (!res.ok) return null
    const u = (await res.json())?.[0]
    if (!u || u.activo !== true) return null
    return { id: u.usuario_id, nombre: u.nombre, rol: u.rol, tiendas: u.tiendas || [], activo: u.activo }
  } catch {
    return null
  }
}

// Candado de las rutas /api/indi/*: GET/prueba piden sesión válida; los POST que
// cambian a Indi piden además `puedeEditarIndi`. Devuelve { usuario } o { error: Response }.
export async function autorizar(req, { editar = false } = {}) {
  const usuario = await usuarioDeSesion(req)
  if (!usuario) return { error: Response.json({ error: 'Necesitas iniciar sesión' }, { status: 401 }) }
  if (editar && !puedeEditarIndi(usuario)) {
    return { error: Response.json({ error: MSG_SOLO_DUENOS }, { status: 403 }) }
  }
  return { usuario }
}
