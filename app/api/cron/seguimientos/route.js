import { NextResponse } from 'next/server'
import { getContactos, marcarSeguimiento, marcarReactivacion, getPedidosPorTelefono } from '@/lib/contactos'
import { decidirReactivacion } from '@/lib/reactivacion'
import { tail9 } from '@/lib/etiqueta-crm'
import { getAutomatizaciones } from '@/lib/automatizaciones'
import { decidirSeguimiento } from '@/lib/decidir-seguimiento'
import { cuerpoSeguimiento } from '@/lib/seguimiento-envio'
import { cabecerasMaquina } from '@/lib/auth-maquina'
import { urlPropia } from '@/lib/url-propia'

// Cron de SEGUIMIENTOS automáticos: la ENCUESTA DE REACTIVACIÓN para chats
// atendidos que se quedaron callados (las reglas por temperatura se quitaron el
// 22-sep-2026) y, desde la fase 3, la REACTIVACIÓN por etapa (lib/reactivacion.js).
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
  const conEncuesta = Boolean(cfg?.seguimientos?.activo)
  const conReactivacion = Boolean(cfg?.reactivacion?.activo)
  if (!conEncuesta && !conReactivacion) {
    return NextResponse.json({ ok: true, skipped: 'encuesta y reactivación apagadas' })
  }

  // Dominio de producción, NO req.url: la dirección del despliegue está
  // protegida por Vercel y TODOS los envíos rebotaban con 401 (hasta 22-sep-2026,
  // cero seguimientos en la historia). Ver lib/url-propia.js.
  const origin = urlPropia()
  // `null` = TODOS los canales. Con el default (solo el número principal) los
  // contactos del otro número nunca recibían seguimiento. Cada envío sale por el
  // número al que ese cliente escribió (`Canal: c.phoneId`).
  const contactos = await getContactos(null).catch(() => [])
  const now = Date.now()
  const enviados = []
  const errores = []
  let evaluados = 0
  const yaEscritos = new Set()

  // POST a /api/saliente con la credencial de máquina; devuelve true si salió.
  const enviar = async (c, cuerpo, motivo) => {
    try {
      const r = await fetch(`${origin}/api/saliente`, {
        method: 'POST', headers: cabecerasMaquina(), body: JSON.stringify({ ...cuerpo, auto: true }),
      })
      if (r.ok) return true
      const detalle = await r.text().catch(() => '')
      errores.push({ telefono: c.telefono, motivo, status: r.status, detalle: detalle.slice(0, 160) })
      console.error('[cron seguimientos] /api/saliente rechazó', r.status, motivo, c.telefono, detalle.slice(0, 160))
    } catch (e) {
      errores.push({ telefono: c.telefono, motivo, error: e.message })
      console.error('[cron seguimientos] envío falló', motivo, c.telefono, e.message)
    }
    return false
  }

  // ── 🔄 Reactivación por etapa (fase 3). Primero, porque es más específica. ──
  if (conReactivacion) {
    const pedidos = await getPedidosPorTelefono().catch(() => ({}))
    for (const c of contactos) {
      const d = decidirReactivacion({ config: cfg, contacto: c, pedido: pedidos[tail9(c.telefono)] || null, ahoraMs: now })
      if (!d) continue
      evaluados++
      const cuerpo = { Telefono: c.telefono, Nombre: c.alias || c.nombre || '', Canal: c.phoneId, Mensaje: d.texto }
      if (await enviar(c, cuerpo, `reactivacion_${d.toque}`)) {
        await marcarReactivacion(c.telefono, d.toque).catch(() => {})
        yaEscritos.add(c.telefono)
        enviados.push({ telefono: c.telefono, motivo: `reactivacion_${d.toque}`, etapa: d.etapa })
      }
    }
  }

  for (const c of (conEncuesta ? contactos : [])) {
    if (yaEscritos.has(c.telefono)) continue
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
        // Ya no se mueve el chat a una bandeja ENCUESTA (diseño 2026-09-22): se
        // queda en ATENDIDO y `ultimo_seguimiento_at` evita repetir la pregunta.
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
