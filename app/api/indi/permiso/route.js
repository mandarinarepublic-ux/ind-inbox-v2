// ¿Puede esta sesión cambiar a Indi? Solo para que la pantalla 🧠 INDI esconda
// los botones de guardar; los POST de /api/indi/* vuelven a revisar el permiso.
import { NextResponse } from 'next/server'
import { autorizar, permisoIndi } from '@/lib/editor-indi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req) {
  const { usuario, error: noAut } = await autorizar(req)
  if (noAut) return noAut
  return NextResponse.json(permisoIndi(usuario))
}
