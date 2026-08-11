// app/api/admin/meta-waba/route.js — HERRAMIENTA TEMPORAL, 10-ago-2026.
//
// Por qué existe: el 10-ago a las 15:24 UTC Meta mandó ACCOUNT_OFFBOARDED sobre
// la WABA del 9804 y la app dejó de recibir y de enviar. El número se reconectó,
// pero la SUSCRIPCIÓN de la app a esa WABA quedó rota, y arreglarla exige llamar
// a la Graph API con un token que tenga permiso sobre esa cuenta.
//
// Ese token (META_TOKEN) está marcado como *Sensitive* en Vercel: NADIE puede
// volver a leerlo, ni por el panel ni por CLI. Pero la app sí lo tiene en
// ejecución. De ahí esta ruta: es la única forma de usarlo sin conocerlo.
//
// ⚠️ BORRAR cuando el 9804 vuelva a recibir mensajes. No es parte del producto.
//
// Seguridad: queda detrás del candado (no está en lib/rutas-publicas.js), así que
// exige sesión del CRM. Sin cookie devuelve 401, comprobado.
import { CANALES } from '@/lib/canales'

export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v21.0'

/** Limpia el BOM invisible que deja cargar la variable desde PowerShell. */
const token = () => String(process.env.META_TOKEN || '').replace(/^﻿/, '').trim()

async function graph(ruta, metodo = 'GET') {
  const sep = ruta.includes('?') ? '&' : '?'
  try {
    const r = await fetch(`${GRAPH}${ruta}${sep}access_token=${encodeURIComponent(token())}`, {
      method: metodo,
      cache: 'no-store',
    })
    const cuerpo = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, cuerpo }
  } catch (e) {
    return { ok: false, status: 0, cuerpo: { error: { message: e.message } } }
  }
}

/**
 * GET sin parámetros  → diagnóstico, SOLO LECTURA.
 * GET ?accion=suscribir → suscribe la app a la WABA del canal indicado.
 *
 * Que la acción vaya por GET es feo a propósito: hay que poder dispararla
 * escribiendo una dirección en el navegador, porque es el único sitio donde
 * existe la sesión que el candado exige. Es temporal.
 */
export async function GET(req) {
  const url = new URL(req.url)
  const accion = url.searchParams.get('accion') || ''
  const canalId = url.searchParams.get('canal') || 'secundario'   // 9804 por defecto

  const canal = CANALES.find((c) => c.id === canalId)
  if (!canal) {
    return Response.json({ error: `Canal desconocido: ${canalId}`, canales: CANALES.map(c => c.id) }, { status: 400 })
  }
  if (!token()) {
    return Response.json({ error: 'META_TOKEN no está configurado en este entorno' }, { status: 500 })
  }

  const salida = {
    canal: { id: canal.id, etiqueta: canal.etiqueta, wabaId: canal.wabaId, phoneId: canal.phoneId },
  }

  // El token de verificación del webhook, para poder copiarlo en la consola de
  // Meta. No es una credencial de acceso: es solo la palabra que Meta repite en
  // el GET de verificación para probar que el endpoint es nuestro.
  //
  // Se muestra porque el 10-ago Meta intentó verificar el webhook 140 veces en un
  // segundo y le respondimos 403 las 140: el valor que Meta tiene guardado NO
  // coincide con el de acá, y eso bloquea cualquier intento de volver a guardar
  // la configuración desde su consola. Sin poder leerlo, no hay forma de saber
  // qué escribir allá.
  //
  // Solo lo ve quien tiene sesión: esta ruta está detrás del candado.
  const verify = String(process.env.WHATSAPP_VERIFY_TOKEN || '')
  salida.verificacion_del_webhook = {
    verify_token: verify || '(NO CONFIGURADO)',
    largo: verify.length,
    // Un BOM o un espacio al final son invisibles al copiar y hacen fallar la
    // comparación exacta del GET. Si esto sale true, ese es el problema.
    tiene_espacios_o_bom: verify !== verify.trim() || /^﻿/.test(verify),
    url_que_debe_estar_en_meta: 'https://ind-inbox.apps.mandarinaec.com/api/webhook',
    nota: 'Copia verify_token TAL CUAL en la configuración del webhook de Meta.',
  }

  // 1. ¿El token tiene permiso sobre esta WABA? Una lectura simple lo dice: si
  //    responde `missing permissions` (subcode 33), el activo no está asignado
  //    al usuario del sistema dueño del token.
  const cuenta = await graph(`/${canal.wabaId}?fields=id,name`)
  salida.lectura_de_la_waba = cuenta.ok
    ? { ok: true, ...cuenta.cuerpo }
    : { ok: false, status: cuenta.status, error: cuenta.cuerpo?.error }

  // 2. ¿Qué apps están suscritas hoy? Es la pregunta del millón.
  const subs = await graph(`/${canal.wabaId}/subscribed_apps`)
  salida.apps_suscritas = subs.ok
    ? subs.cuerpo
    : { ok: false, status: subs.status, error: subs.cuerpo?.error }

  // 2b. Estado de revisión de la cuenta: si Meta la tiene en revisión o
  //     restringida, deja de entregar aunque todo lo demás esté bien.
  const revision = await graph(`/${canal.wabaId}?fields=account_review_status,business_verification_status,status`)
  salida.estado_de_la_cuenta = revision.ok
    ? revision.cuerpo
    : { ok: false, status: revision.status, error: revision.cuerpo?.error }

  // 3. Estado del número, para ver si Meta lo da por conectado.
  // `status` es el campo que dice de verdad qué le pasa al número (CONNECTED,
  // DISCONNECTED, FLAGGED, RESTRICTED, PENDING…). Los cuatro campos que se pedían
  // antes no lo incluían, y por eso el diagnóstico se quedó a medias nueve horas.
  const numero = await graph(
    `/${canal.phoneId}?fields=id,display_phone_number,verified_name,quality_rating,` +
    `platform_type,status,name_status,code_verification_status,throughput,messaging_limit_tier`
  )
  salida.numero = numero.ok
    ? numero.cuerpo
    : { ok: false, status: numero.status, error: numero.cuerpo?.error }

  if (accion !== 'suscribir' && accion !== 'resuscribir') {
    salida.nota = 'Diagnóstico, no se cambió nada. Para suscribir: agrega ?accion=suscribir'
    return Response.json(salida, { status: 200 })
  }

  // 4. La acción. Suscribe LA APP DUEÑA DEL TOKEN a esta WABA.
  //
  // Con ?accion=resuscribir se QUITA la suscripción y se vuelve a poner. Volver a
  // suscribir a secas no hace nada cuando la app ya figura en la lista —que es el
  // caso—; el reinicio de verdad es soltarla y engancharla otra vez.
  //
  // No arriesga nada: por esta WABA ya no entra un solo evento, así que quitarla
  // no puede empeorarlo, y el otro número de IND vive en OTRA WABA
  // (1043571971409840), así que lo que funciona ni se toca.
  if (accion === 'resuscribir') {
    const del = await graph(`/${canal.wabaId}/subscribed_apps`, 'DELETE')
    salida.desuscripcion = { ok: del.ok, status: del.status, respuesta: del.cuerpo }
  }

  const post = await graph(`/${canal.wabaId}/subscribed_apps`, 'POST')
  salida.suscripcion = { ok: post.ok, status: post.status, respuesta: post.cuerpo }

  // 5. Releer para confirmar de verdad, no fiarse del 200 del POST: un 200 de la
  //    Graph API no prueba nada por sí solo, ya nos pasó con las plantillas.
  const confirmar = await graph(`/${canal.wabaId}/subscribed_apps`)
  salida.apps_suscritas_despues = confirmar.ok
    ? confirmar.cuerpo
    : { ok: false, status: confirmar.status, error: confirmar.cuerpo?.error }

  return Response.json(salida, { status: 200 })
}
