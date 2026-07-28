import { NextResponse } from 'next/server'

// TEMPORAL — borrar con el resto de rutas de diagnóstico al terminar.
//
// Migra un número entre WABAs del MISMO portafolio, por API. La interfaz del
// Administrador lo bloquea (botón gris) porque el portafolio está en el tope de
// 2 números, pero una migración interna es NEUTRA: saca el número de una cuenta
// y lo pone en otra, el total no cambia.
//
// Se ejecuta por pasos a propósito, uno por llamada, para poder ver el resultado
// de cada uno antes de seguir. El orden es:
//   1) migrar     -> POST /{waba_destino}/phone_numbers   (devuelve phone_id nuevo)
//   2) pedir_codigo -> POST /{phone_id}/request_code       (manda el OTP)
//   3) verificar  -> POST /{phone_id}/verify_code          (con el OTP recibido)
//   4) registrar  -> POST /{phone_id}/register             (con el PIN de 2 pasos)
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

const META_TOKEN = process.env.META_TOKEN || ''
const GRAPH = 'https://graph.facebook.com/v22.0'

async function llamar(path, cuerpo, metodo = 'POST') {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  })
  const body = await r.json().catch(() => ({}))
  return { http: r.status, ok: r.ok, body }
}

export async function POST(req) {
  const q = req.nextUrl.searchParams
  const clave = q.get('clave') || ''
  const claves = [process.env.MIG_KEY, process.env.DIAG_KEY].filter(Boolean)
  if (!claves.length || !claves.includes(clave)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  if (!META_TOKEN) return NextResponse.json({ ok: false, error: 'META_TOKEN ausente' }, { status: 500 })

  const accion = q.get('accion') || ''
  let res

  if (accion === 'migrar') {
    const waba = q.get('waba') || ''
    const cc = q.get('cc') || ''
    const numero = q.get('numero') || ''
    if (!/^\d{5,25}$/.test(waba) || !/^\d{1,4}$/.test(cc) || !/^\d{6,15}$/.test(numero)) {
      return NextResponse.json({ ok: false, error: 'parametros invalidos' }, { status: 400 })
    }
    res = await llamar(`${waba}/phone_numbers`, {
      cc, phone_number: numero, migrate_phone_number: true,
    })

  } else if (accion === 'borrar') {
    // ⚠️ PUNTO SIN RETORNO. Saca el número de su WABA. A partir de acá el número
    // no pertenece a ninguna cuenta hasta completar 'agregar' + verificación:
    // no envía NI recibe. Solo se usa cuando 'migrar' está bloqueado y el cupo
    // de números del portafolio está lleno (borrar libera el cupo).
    const phone = q.get('phone') || ''
    if (!/^\d{5,25}$/.test(phone)) {
      return NextResponse.json({ ok: false, error: 'phone invalido' }, { status: 400 })
    }
    res = await llamar(phone, null, 'DELETE')

  } else if (accion === 'agregar') {
    // Alta del número en la WABA destino. A diferencia de 'migrar', NO exige que
    // el número traiga un nombre visible aprobado: el nombre se define acá.
    const waba = q.get('waba') || ''
    const cc = q.get('cc') || ''
    const numero = q.get('numero') || ''
    const nombre = (q.get('nombre') || '').trim()
    if (!/^\d{5,25}$/.test(waba) || !/^\d{1,4}$/.test(cc) || !/^\d{6,15}$/.test(numero) || nombre.length < 3) {
      return NextResponse.json({ ok: false, error: 'parametros invalidos' }, { status: 400 })
    }
    res = await llamar(`${waba}/phone_numbers`, {
      cc, phone_number: numero, verified_name: nombre,
    })

  } else if (accion === 'desregistrar') {
    // Suelta el número de la Cloud API SIN sacarlo de su WABA. Es lo que pide
    // Meta cuando el alta en otra cuenta choca con subcode 2388001 ("este número
    // está registrado en una cuenta existente"): el registro es único y hay que
    // liberar el viejo antes de crear el nuevo.
    // Deja de enviar y recibir por ese phone_id hasta que se registre en el
    // destino, así que se encadena inmediatamente con 'registrar'.
    const phone = q.get('phone') || ''
    if (!/^\d{5,25}$/.test(phone)) {
      return NextResponse.json({ ok: false, error: 'phone invalido' }, { status: 400 })
    }
    res = await llamar(`${phone}/deregister`, {})

  } else if (accion === 'pedir_codigo') {
    const phone = q.get('phone') || ''
    const metodo = (q.get('metodo') || 'SMS').toUpperCase()   // SMS o VOICE
    if (!/^\d{5,25}$/.test(phone) || !['SMS', 'VOICE'].includes(metodo)) {
      return NextResponse.json({ ok: false, error: 'parametros invalidos' }, { status: 400 })
    }
    res = await llamar(`${phone}/request_code`, { code_method: metodo, language: 'es' })

  } else if (accion === 'verificar') {
    const phone = q.get('phone') || ''
    const codigo = (q.get('codigo') || '').replace(/\D/g, '')
    if (!/^\d{5,25}$/.test(phone) || !/^\d{4,8}$/.test(codigo)) {
      return NextResponse.json({ ok: false, error: 'parametros invalidos' }, { status: 400 })
    }
    res = await llamar(`${phone}/verify_code`, { code: codigo })

  } else if (accion === 'registrar') {
    // El PIN llega por cuerpo, NUNCA por query string: en la URL queda en logs.
    const phone = q.get('phone') || ''
    const { pin } = await req.json().catch(() => ({}))
    if (!/^\d{5,25}$/.test(phone) || !/^\d{6}$/.test(String(pin || ''))) {
      return NextResponse.json({ ok: false, error: 'parametros invalidos' }, { status: 400 })
    }
    res = await llamar(`${phone}/register`, { messaging_product: 'whatsapp', pin: String(pin) })

  } else {
    return NextResponse.json({ ok: false, error: 'accion desconocida' }, { status: 400 })
  }

  const e = res.body?.error || {}
  console.log(
    `[/api/admin/migrar-numero] accion=${accion} http=${res.http} ` +
    `code=${e.code} subcode=${e.error_subcode} msg=${e.message || 'OK'} fbtrace=${e.fbtrace_id || '—'}`
  )
  return NextResponse.json({ accion, ...res }, { status: res.ok ? 200 : 502 })
}
