// Probar a Indi sin escribirle a nadie: llama al agente igual que el webhook,
// con un teléfono de mentira y source 'probar'. Cualquier sesión válida.
import { NextResponse } from 'next/server'
import { autorizar } from '@/lib/editor-indi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const AGENT_URL = process.env.INDX_AGENT_URL || 'https://indx-agent.vercel.app/api/agent'
const AGENT_KEY = String(process.env.INDX_AGENT_KEY || '').replace(/[^\x21-\x7E]/g, '')

export async function POST(req) {
  const { error: noAut } = await autorizar(req)
  if (noAut) return noAut
  try {
    const { mensaje, historial } = await req.json().catch(() => ({}))
    const message = String(mensaje || '').trim()
    if (!message) return NextResponse.json({ error: 'Escribe un mensaje' }, { status: 400 })
    const history = Array.isArray(historial) ? historial : []

    const r = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mandi-key': AGENT_KEY },
      body: JSON.stringify({ phone: '593000000000', name: '', message, history, source: 'probar' }),
      signal: AbortSignal.timeout(28000),
      cache: 'no-store',
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return NextResponse.json({ error: data?.error || `El agente respondió ${r.status}` }, { status: 502 })
    return NextResponse.json({
      reply: data.reply ?? '',
      imagenes: Array.isArray(data.imagenes) ? data.imagenes : [],
      // sinBase: Indi no pudo leer su base. escalarPedido: pidió pasar el chat
      // (escalado = además se hizo). La pantalla avisa de los dos.
      sinBase: !!data.sinBase,
      escalarPedido: !!data.escalarPedido,
      escalado: !!data.escalado,
      motivo: data.motivo ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: `Indi no respondió: ${err.message}` }, { status: 502 })
  }
}
