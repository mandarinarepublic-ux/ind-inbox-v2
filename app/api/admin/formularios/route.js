// app/api/admin/formularios/route.js — 📝 crear y publicar en Meta los formularios
// de WhatsApp (lib/formularios.js). Portado de MANDI el 14-nov-2026.
//
// ⚠️ IND tiene DOS WABAs (3326 y 9804, lib/canales.js) y el formulario se manda
// por NOMBRE: tiene que existir en la WABA del número que lo envía. Por eso GET y
// POST recorren todas las WABAs de CANALES.
//
// Existe porque META_TOKEN es *Sensitive* en Vercel: nadie lo puede leer, pero la
// app sí lo tiene en ejecución (mismo truco que /api/admin/meta-waba).
//
//   GET                       → estado del formulario en la WABA de MANDI.
//   POST ?accion=crear        → lo crea y lo publica. Si ya está PUBLICADO no hace
//                               nada; si quedó en BORRADOR (falló la publicación)
//                               lo borra y lo vuelve a crear.
//   ?formulario=datos_pedido  (por defecto)
//
// Seguridad: no está en lib/rutas-publicas.js → el candado exige sesión del CRM o
// la clave de máquina. Nunca devuelve el token.
import { CANALES } from '@/lib/canales'
import { env } from '@/lib/env'
import { FORMULARIOS, formularioValido, flowJsonDatosPedido } from '@/lib/formularios'

export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v23.0'
const JSON_DE = { datos_pedido: flowJsonDatosPedido }

async function graph(ruta, metodo = 'GET', cuerpo) {
  try {
    const r = await fetch(`${GRAPH}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${env('META_TOKEN')}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      cache: 'no-store',
    })
    const data = await r.json().catch(() => ({}))
    return r.ok ? data : { ok: false, status: r.status, error: data?.error }
  } catch (e) {
    return { ok: false, status: 0, error: { message: e.message } }
  }
}

function contexto(req) {
  const url = new URL(req.url)
  const clave = formularioValido(url.searchParams.get('formulario') || 'datos_pedido')
  const wabas = [...new Set(CANALES.map((c) => String(c.wabaId || '')).filter(Boolean))]
  return { url, clave, wabas }
}

async function buscar(wabaId, nombre) {
  const r = await graph(`/${wabaId}/flows?fields=id,name,status,validation_errors&limit=200`)
  if (r?.ok === false) return { error: r }
  return { flow: (r?.data || []).find((f) => f.name === nombre) || null }
}

async function crearEn(wabaId, clave, nombre) {
  const previo = await buscar(wabaId, nombre)
  if (previo.error) return { wabaId, ok: false, paso: 'buscar', error: previo.error }
  if (previo.flow?.status === 'PUBLISHED') return { wabaId, ok: true, yaEstaba: true, flow: previo.flow }
  if (previo.flow) {
    // Un borrador viejo (de un intento fallido): se borra para crearlo limpio.
    const b = await graph(`/${previo.flow.id}`, 'DELETE')
    if (b?.ok === false) return { wabaId, ok: false, paso: 'borrar borrador', flow: previo.flow, error: b.error }
  }
  const creado = await graph(`/${wabaId}/flows`, 'POST', {
    name: nombre,
    categories: ['OTHER'],
    flow_json: JSON.stringify(JSON_DE[clave]()),
    publish: true,
  })
  if (creado?.ok === false) return { wabaId, ok: false, paso: 'crear', error: creado.error }
  const final = await buscar(wabaId, nombre)
  return { wabaId, ok: final.flow?.status === 'PUBLISHED', creado, flow: final.flow || null }
}

export async function GET(req) {
  const { clave, wabas } = contexto(req)
  if (!clave) return Response.json({ error: 'Formulario desconocido', formularios: Object.keys(FORMULARIOS) }, { status: 400 })
  if (!env('META_TOKEN')) return Response.json({ error: 'Falta META_TOKEN' }, { status: 500 })
  const nombre = FORMULARIOS[clave].flowName
  const porWaba = await Promise.all(wabas.map(async (w) => ({ wabaId: w, ...(await buscar(w, nombre)) })))
  return Response.json({ ok: true, nombre, porWaba })
}

export async function POST(req) {
  const { url, clave, wabas } = contexto(req)
  if (url.searchParams.get('accion') !== 'crear') return Response.json({ error: 'Usa ?accion=crear' }, { status: 400 })
  if (!clave) return Response.json({ error: 'Formulario desconocido', formularios: Object.keys(FORMULARIOS) }, { status: 400 })
  if (!env('META_TOKEN')) return Response.json({ error: 'Falta META_TOKEN' }, { status: 500 })
  const nombre = FORMULARIOS[clave].flowName
  const porWaba = []
  for (const w of wabas) porWaba.push(await crearEn(w, clave, nombre))
  return Response.json({ ok: porWaba.every((x) => x.ok), nombre, porWaba })
}
