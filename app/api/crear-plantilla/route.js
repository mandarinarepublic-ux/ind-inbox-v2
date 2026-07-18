import { NextResponse } from 'next/server'
import { getWabaId, GRAPH } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// TEMPORAL — crea la plantilla de re-enganche de IND y la manda a aprobación de Meta.
// Protegido con clave (?k=). BORRAR tras usar. Espeja la aprobada de MANDI.
const META_TOKEN = process.env.META_TOKEN || ''
const KEY = 'ind_tpl_5k29'

const TEMPLATE = {
  name: 'reactivacion_clientes_ind',
  language: 'es',
  category: 'MARKETING',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Esto te va a encantar' },
    {
      type: 'BODY',
      text: 'Hola {{1}} 😎\n\nNos llegaron nuevos diseños de {{2}} 🔥\nY honestamente… están demasiado buenos 👀\n\nMíralos aquí:\n{{3}}\n\n¿Quieres que te recomiende uno según tu estilo?',
      example: { body_text: [['Ana', 'IND Store', 'https://indstore.ec']] },
    },
    { type: 'FOOTER', text: 'Responde SALIR para no recibir más mensajes' },
  ],
}

async function crear() {
  const { id: wabaId, error } = await getWabaId()
  if (!wabaId) return { ok: false, error: `sin WABA: ${error}` }
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(TEMPLATE),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, wabaId, data, enviado: TEMPLATE }
}

async function handle(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('k') !== KEY) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 403 })
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'sin META_TOKEN' })
  return NextResponse.json(await crear())
}

export const GET = handle
export const POST = handle
