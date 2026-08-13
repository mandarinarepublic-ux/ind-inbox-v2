import { NextResponse } from 'next/server'
import { COOKIE_SESION, verificarSesion, secretoSesion } from '@/lib/sesion'
import { esRutaPublica } from '@/lib/rutas-publicas'
import { puedeEntrar } from '@/lib/acceso'

// ── La puerta del inbox de IND ────────────────────────────────────────────────
// Hasta hoy esto era una URL pública: cualquiera que la conociera leía TODAS las
// conversaciones con las clientas y podía escribirles haciéndose pasar por
// IND STORE. Es el mismo agujero que se comprobó en MANDI el 6-ago mandando un
// WhatsApp real desde una terminal, sin ninguna credencial.
//
// Tres puertas, igual que en el CRM y en MANDI:
//   1. PERSONA con sesión del CRM + permiso INBOX_INDSTORE en crm.usuarios
//   2. MÁQUINA con `Authorization: Bearer $INBOX_API_TOKEN`
//   3. RUTA PÚBLICA que se defiende sola (lib/rutas-publicas.js)
//
// ⚠️ AUTH_MODO manda sobre todo, y sin la variable el valor es `observar`:
//   observar → NO rechaza nada, solo anota lo que habría rechazado (arranca así)
//   bloquear → rechaza de verdad
//   apagado  → ni siquiera mira; es el interruptor de pánico
//
// ✅ Bloqueando desde el 8-ago-2026 (Fase 5, ver
// docs/HANDOFF-2026-08-08-fase5-ind.md): `AUTH_MODO=bloquear` en producción.
// API sin cookie → 401; páginas sin cookie → 307 al login del CRM. Verificado
// en vivo ese día por Rodrigo y Xavier: entra y sale OK, cero mensajes
// fallidos, y ningún 401 de un usuario real en los registros (solo sondas).
// Si algún día hay que volver a `observar` (por ejemplo para dar de alta
// gente nueva sin que la sorprenda un 401), que sea decisión explícita, no el
// default de "sin la variable".
//
// ⚠️ MEDIDO el 7-ago-2026 en MANDI, y NO es lo que decía el plan: cambiar
// AUTH_MODO en Vercel **no surte efecto solo**. Next incrusta process.env en el
// bundle de Edge al compilar, así que el middleware sigue con el valor con el que
// se construyó. Se comprobó con tres sondas: puesta la variable en `apagado`, el
// middleware siguió anotando 3 minutos después; recién dejó de hacerlo tras
// redesplegar.
//
// Entonces, para usar el interruptor de pánico de madrugada:
//   1. cambiar AUTH_MODO en Vercel
//   2. `vercel redeploy <url-del-deploy-actual> --scope mandarinarepublic-6819s-projects`
// Sigue sin necesitar commit ni tocar código, pero tarda ~1 minuto, no 30 segundos.
const LOGIN = 'https://crm.apps.mandarinaec.com'

const modo = () => (process.env.AUTH_MODO || 'observar').trim().toLowerCase()

function tokenDeMaquina(req) {
  const esperado = String(process.env.INBOX_API_TOKEN || '').replace(/[^\x21-\x7E]/g, '')
  if (!esperado) return false
  const recibido = (req.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '').replace(/[^\x21-\x7E]/g, '')
  // Comparación de largo constante: el tiempo de respuesta no delata aciertos.
  if (recibido.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < recibido.length; i++) dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

export async function middleware(req) {
  if (modo() === 'apagado') return NextResponse.next()

  const { pathname } = req.nextUrl
  if (esRutaPublica(pathname)) return NextResponse.next()

  const esApi = pathname.startsWith('/api/')
  let motivo = null

  const secreto = secretoSesion()
  if (!secreto) {
    motivo = 'sin-SESSION_SECRET'
  } else {
    const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secreto)
    if (!sesion) {
      motivo = tokenDeMaquina(req) ? null : 'sin-sesion'
    } else {
      const permiso = await puedeEntrar(sesion.id)
      if (!permiso.ok) motivo = permiso.motivo
    }
  }

  if (!motivo) return NextResponse.next()

  if (modo() !== 'bloquear') {
    // MODO OBSERVACIÓN: no se rechaza nada. Esta línea es el insumo para decidir
    // si ya se puede bloquear; se lee en los registros de Vercel buscando
    // "[auth] rechazaria".
    console.log(`[auth] rechazaria ${req.method} ${pathname} — ${motivo}`)
    return NextResponse.next()
  }

  if (esApi) return NextResponse.json({ error: 'No autenticado', motivo }, { status: 401 })

  if (motivo === 'sin-permiso' || motivo === 'inactivo') {
    return new NextResponse(
      'No tienes acceso a este inbox. Pídele a un administrador que te habilite INBOX INDSTORE en el CRM.',
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const volver = `${req.nextUrl.origin}${pathname}${req.nextUrl.search}`
  return NextResponse.redirect(`${LOGIN}/?volver=${encodeURIComponent(volver)}`)
}

// Los webhooks quedan fuera ACÁ, a nivel de configuración: así el código de
// sesión ni siquiera corre para ellos. `lib/rutas-publicas.js` es la segunda
// capa, por si alguien toca esto sin pensar.
//
// Ojo con las diferencias contra MANDI: acá NO van `api/social/webhook` ni
// `api/pago-dlocal` porque esas rutas no existen en IND, y SÍ va
// `apple-touch-icon` — es un archivo estático de `public/` que el navegador pide
// solo, sin cookie, y no tiene por qué ensuciar el registro de observación ni
// caer al login cuando se encienda el bloqueo.
//
// `api/cron/pendientes` (13-ago-2026, puerto desde MANDI): recordatorio de
// pendientes por Telegram, la llama Vercel Cron sin sesión — misma razón que
// `api/cron/seguimientos`.
export const config = {
  matcher: [
    '/((?!api/webhook|api/cron/seguimientos|api/cron/pendientes|_next/static|_next/image|favicon.ico|sw.js|icon-|apple-touch-icon|manifest.webmanifest).*)',
  ],
}
