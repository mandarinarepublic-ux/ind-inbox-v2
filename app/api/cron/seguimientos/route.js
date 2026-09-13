import { NextResponse } from 'next/server'
import { getContactos, marcarSeguimiento, updateEstado } from '@/lib/contactos'
import { getAutomatizaciones } from '@/lib/automatizaciones'
import { decidirSeguimiento } from '@/lib/decidir-seguimiento'
import { cuerpoSeguimiento } from '@/lib/seguimiento-envio'
import { cabecerasMaquina } from '@/lib/auth-maquina'

// Cron de SEGUIMIENTOS automáticos: por temperatura del lead (Eje 2) y la
// ENCUESTA DE REACTIVACIÓN para chats atendidos que se quedaron callados.
// Lo llama Vercel Cron CADA HORA (ver vercel.json). Reglas, textos y botones
// viven en inbox.automatizaciones.config.seguimientos. Arranca TODO APAGADO.
//
// La regla entera (a quién, cuándo, cuál mensaje) es lib/decidir-seguimiento.js,
// que es puro y está probado. Acá solo se recorre la agenda y se envía.
//
// Rieles de seguridad (todos en la decisión):
//  - Interruptor global + por regla.
//  - Tope 1 auto-envío por ventana por contacto (ultimo_seguimiento_at > ultimo_entrante_at).
//  - Se cancela solo si el cliente responde (su nuevo mensaje reinicia la ventana).
//  - Nunca fuera de las 24h (ahí se necesita plantilla → fase 2).
//  - Si el bot va a contestar ese chat, se lo deja en paz.
//
// ⚠️ Por qué era diario y no mandaba nada (hasta 13-sep-2026): corría una vez al
// día a las 9 am, así que una regla "a las 23 h de silencio" solo acertaba si el
// cliente había escrito justo a las 10 am del día anterior. Y encima miraba el
// modo del CHAT, que nacía siempre en IA. Cero seguimientos en toda la historia.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const isVercelCron = req.headers.get('x-vercel-cron') != null // Vercel lo pone solo en crons reales
  const keyQ = new URL(req.url).searchParams.get('key')
  if (isVercelCron) return true
  if (secret && (auth === `Bearer ${secret}` || keyQ === secret)) return true
  return false
}

export async function GET(req) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const cfg = await getAutomatizaciones().catch(() => null)
  if (!cfg?.seguimientos?.activo) {
    return NextResponse.json({ ok: true, skipped: 'seguimientos apagado (global)' })
  }

  const origin = new URL(req.url).origin
  // `null` = TODOS los canales. Con el default (solo el número principal) los
  // contactos del otro número nunca recibían seguimiento. Cada envío sale por el
  // número al que ese cliente escribió (`Canal: c.phoneId`).
  const contactos = await getContactos(null).catch(() => [])
  const now = Date.now()
  const enviados = []
  const errores = []
  let evaluados = 0

  for (const c of contactos) {
    const d = decidirSeguimiento({ config: cfg, contacto: c, ahoraMs: now })
    if (!d) continue

    evaluados++
    try {
      // Mismo motivo que en el webhook: sin la credencial de máquina, el candado
      // devuelve 401 y este cron deja de mandar seguimientos SIN decir nada.
      const r = await fetch(`${origin}/api/saliente`, {
        method: 'POST',
        headers: cabecerasMaquina(),
        body: JSON.stringify({ ...cuerpoSeguimiento({ regla: d.regla, contacto: c }), auto: true }),
      })
      if (r.ok) {
        await marcarSeguimiento(c.telefono).catch(() => {})
        // La encuesta mueve el chat a su propia bandeja: así se ve a quién se le
        // preguntó y no se vuelve a preguntar. La respuesta del cliente lo
        // devuelve a PENDIENTES como cualquier entrante.
        if (d.motivo === 'encuesta') {
          await updateEstado(c.telefono, 'ENCUESTA', c.phoneId)
            .catch(e => console.error('[cron seguimientos] no pude marcar ENCUESTA', c.telefono, e.message))
        }
        enviados.push({ telefono: c.telefono, motivo: d.motivo, botones: (d.regla.botones || []).length })
      } else {
        // El código y el cuerpo van a la respuesta Y al log: un 401 acá es el
        // candado, un 4xx de Meta es la ventana o el número. Callarlo es lo que
        // tuvo al cron de MANDI "sano" sin mandar nada.
        const detalle = await r.text().catch(() => '')
        errores.push({ telefono: c.telefono, motivo: d.motivo, status: r.status, detalle: detalle.slice(0, 160) })
        console.error('[cron seguimientos] /api/saliente rechazó', r.status, c.telefono, detalle.slice(0, 160))
      }
    } catch (e) {
      errores.push({ telefono: c.telefono, motivo: d.motivo, error: e.message })
      console.error('[cron seguimientos] envío falló', c.telefono, e.message)
    }
  }

  return NextResponse.json({
    ok: true,
    enviados: enviados.length,
    errores: errores.length,
    detalle: { enviados, errores, evaluados },
  })
}
