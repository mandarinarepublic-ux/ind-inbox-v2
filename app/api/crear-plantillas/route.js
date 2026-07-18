import { NextResponse } from 'next/server'
import { getWabaId, GRAPH } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// TEMPORAL — crea la plantilla "recuperar conversación" de IND y lista el estado de
// TODAS las plantillas. Protegido con clave (?k=). BORRAR tras usar.
const META_TOKEN = process.env.META_TOKEN || ''
const KEY = 'ind_tpl_5k29'

const TEMPLATE = {
  name: 'recuperar_conversacion_ind',
  language: 'es',
  category: 'MARKETING',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Seguimos cuando quieras' },
    {
      type: 'BODY',
      text: 'Hola {{1}} 👋\n\nVi que quedó pendiente nuestra conversación 💬\n\nSi todavía te interesa, con gusto retomamos donde la dejamos.\n\n¿Te ayudo con algo? Estoy aquí para lo que necesites 🖤',
      example: { body_text: [['Ana']] },
    },
    { type: 'FOOTER', text: 'Responde SALIR para no recibir más mensajes' },
  ],
}

async function handle(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('k') !== KEY) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 403 })
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'sin META_TOKEN' })
  const { id: wabaId, error } = await getWabaId()
  if (!wabaId) return NextResponse.json({ ok: false, error: `sin WABA: ${error}` })

  // Crear la plantilla nueva.
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(TEMPLATE),
  })
  const data = await res.json().catch(() => ({}))

  // Estado de TODAS las plantillas de la WABA.
  let todas = null
  try {
    const q = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language&limit=100&access_token=${encodeURIComponent(META_TOKEN)}`)
    const qd = await q.json().catch(() => ({}))
    todas = (qd?.data || []).map((t) => ({ name: t.name, status: t.status, category: t.category }))
  } catch {}

  return NextResponse.json({ ok: res.ok, crear: data?.error?.error_user_msg || (res.ok ? 'creada' : data), todas })
}

export const GET = handle
export const POST = handle
