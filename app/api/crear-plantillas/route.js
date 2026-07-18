import { NextResponse } from 'next/server'
import { getWabaId, GRAPH } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// TEMPORAL — crea las plantillas restantes de IND (abandono carrito + confirmación
// pedido) y las manda a aprobación de Meta. Protegido con clave (?k=). BORRAR tras usar.
// Regla Meta: el HEADER TEXT no admite emojis, saltos ni asteriscos (el BODY sí).
const META_TOKEN = process.env.META_TOKEN || ''
const KEY = 'ind_tpl_5k29'

const TEMPLATES = [
  {
    name: 'abandono_carrito_ind',
    language: 'es',
    category: 'MARKETING',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Tu pedido te está esperando' },
      {
        type: 'BODY',
        text: 'Hola {{1}} 👋\n\nVimos que dejaste {{2}} en tu carrito 🛒\nY la verdad… está buenísimo 👀\n\nAún está disponible, pero se agota rápido.\n\nPuedes terminar tu compra aquí:\n{{3}}\n\nSi quieres, te ayudo a elegir talla o modelo 🙂',
        example: { body_text: [['Ana', 'tu conjunto favorito', 'https://indstore.ec']] },
      },
      { type: 'FOOTER', text: 'Responde SALIR para no recibir más mensajes' },
    ],
  },
  {
    name: 'confirmacion_pedido_ind',
    language: 'es',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Compra confirmada' },
      {
        type: 'BODY',
        text: 'Hola {{1}} 🙌\n\nTu pedido #{{2}} ya está confirmado ✅\n\nEstamos preparando {{3}} con todo 🔥\n\nTe avisaremos cuando salga a envío 🚚\n\nGracias por confiar en IND Store 🖤',
        example: { body_text: [['Ana', '1024', 'tu conjunto']] },
      },
    ],
  },
]

async function crearUna(wabaId, tpl) {
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tpl),
  })
  const data = await res.json().catch(() => ({}))
  let status = null
  try {
    const q = await fetch(`${GRAPH}/${wabaId}/message_templates?name=${tpl.name}&fields=name,status,category&access_token=${encodeURIComponent(META_TOKEN)}`)
    const qd = await q.json().catch(() => ({}))
    status = (qd?.data || []).map((t) => ({ name: t.name, status: t.status, category: t.category }))
  } catch {}
  return { name: tpl.name, ok: res.ok, meta: data?.error?.error_user_msg || (res.ok ? 'creada' : data), status }
}

async function handle(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('k') !== KEY) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 403 })
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'sin META_TOKEN' })
  const { id: wabaId, error } = await getWabaId()
  if (!wabaId) return NextResponse.json({ ok: false, error: `sin WABA: ${error}` })
  const resultados = []
  for (const tpl of TEMPLATES) resultados.push(await crearUna(wabaId, tpl))
  return NextResponse.json({ ok: true, wabaId, resultados })
}

export const GET = handle
export const POST = handle
