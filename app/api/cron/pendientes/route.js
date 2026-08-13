import { NextResponse } from 'next/server'
import { getContactos, marcarAvisoTelegram } from '@/lib/contactos'
import { enviarTelegram, telegramConfigurado } from '@/lib/telegram'
import { chatsQueAvisar, textoAviso, enHorarioLaboral, partirPorAntiguedad } from '@/lib/pendientes'

// Recordatorio de chats sin contestar, por Telegram. Lo llama Vercel Cron cada
// 5 min (ver vercel.json). Puerto 1:1 desde wa-inbox-next (MANDARINA), con el
// techo de espera y el dominio del link adaptados a IND (ver lib/pendientes.js
// y BASE_URL abajo).
//
// Por qué existe, además del push: el push avisa de un EVENTO (entró un mensaje).
// Si te lo perdiste, se perdió. Esto avisa de un ESTADO (hay gente esperando) e
// insiste cada 30 min hasta que la bandeja quede vacía.
//
// Sin TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no manda nada y no rompe nada.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// El link tiene que apuntar SIEMPRE al dominio real. `req.url` en una invocacion de
// cron trae la URL del despliegue (ind-inbox-v2-xxxx.vercel.app), donde NO existe la
// cookie de sesion: tocar ese link desde el celular te deja fuera del inbox. Mismo
// problema que en MANDI, mismo arreglo — solo cambia el dominio.
//
// Verificado contra next.config.js de ESTE repo (no copiado de memoria): el
// redirect del host viejo ahí apunta a https://ind-inbox.apps.mandarinaec.com,
// que es el dominio real de IND en *.apps.mandarinaec.com.
// Se puede sobreescribir con INBOX_URL sin tocar codigo.
const BASE_URL = String(process.env.INBOX_URL || 'https://ind-inbox.apps.mandarinaec.com')
  .replace(/[^\x21-\x7E]/g, '')   // por si la variable llega con BOM desde PowerShell
  .replace(/\/+$/, '')            // sin barra final: el link ya la pone

function autorizado(req) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const keyQ = new URL(req.url).searchParams.get('key')
  // ⚠️ La cabecera `x-vercel-cron` NO alcanza por sí sola cuando hay secreto: no
  // está documentada como imposible de falsificar, y aceptarla primero dejaba la
  // ruta abierta a cualquiera que supiera el path. Con secreto configurado manda
  // el secreto —que Vercel manda solo en los crons de verdad—; sin secreto, la
  // cabecera es lo único que hay y ahí sí vale.
  //
  // IND hoy NO tiene CRON_SECRET configurado (verificado el 13-ago-2026), así que
  // este cron arranca en la rama "sin secreto" — igual de segura porque Vercel es
  // el único que manda esa cabecera, pero lista para endurecerse solo con crear la
  // variable, sin tocar código. Copiado de la versión ENDURECIDA de MANDI, no de
  // `app/api/cron/seguimientos/route.js` de este mismo repo, que acepta
  // `x-vercel-cron` SIEMPRE que esté presente, tenga o no secreto — esa es la forma
  // permisiva vieja, y no se toca acá.
  if (secret) return auth === `Bearer ${secret}` || keyQ === secret
  return req.headers.get('x-vercel-cron') != null
}

export async function GET(req) {
  if (!autorizado(req)) {
    // Si algún día Vercel deja de mandar el Authorization esperado, esto tiene
    // que quedar en los registros: un cron que empieza a dar 401 en silencio es
    // la misma clase de falla que este cron entero vino a matar. Nunca el valor
    // del secreto, solo si estaba configurado.
    const traeCabeceraCron = req.headers.get('x-vercel-cron') != null
    const haySecreto = Boolean(process.env.CRON_SECRET)
    console.error(`[cron/pendientes] no autorizado — x-vercel-cron: ${traeCabeceraCron}, CRON_SECRET configurado: ${haySecreto}`)
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const ahora = Date.now()

  // ⚠️ `getContactos(null)` con el null EXPLÍCITO, nunca `getContactos()`.
  // La firma es `getContactosSupabase(canal = META_PHONE_ID)`: sin argumento
  // filtra por el phone_id del 3326 y las conversaciones del 9804 quedarían
  // INVISIBLES para el recordatorio — pendientes reales que nadie ve, que es
  // justo el bug que este cron viene a matar. `null` apaga el filtro
  // (`lib/inbox-supabase.js`) y trae los dos números de la cuenta.
  const contactos = await getContactos(null).catch((e) => {
    console.error('[cron/pendientes] no se pudo leer contactos:', e?.message || e)
    return null
  })
  if (!contactos) {
    return NextResponse.json({ ok: false, error: 'sin contactos' }, { status: 500 })
  }

  // El arrastre (chats que cruzaron el techo de 2h) se calcula SIEMPRE, incluso
  // fuera de horario laboral o sin nada que notificar: es un conteo de estado,
  // no una decisión de si avisar. Solo se MENCIONA en el texto de abajo —
  // jamás se estampa ni se cuenta como notificado (ver lib/pendientes.js).
  const { arrastre } = partirPorAntiguedad(contactos, ahora)

  const aAvisar = chatsQueAvisar(contactos, ahora)
  if (!aAvisar.length) {
    // `sin-pendientes` cubre bandeja vacía de verdad Y todo lo que está dentro del
    // enfriamiento de 30 min — ambos son "no toca avisar todavía". `fuera-de-horario`
    // es la otra causa posible (fuera de 08:00-21:00 Ecuador). Sin distinguirlas,
    // Rodrigo llama la ruta de noche, ve ceros, y no sabe si está sana o rota.
    const motivo = enHorarioLaboral(ahora) ? 'sin-pendientes' : 'fuera-de-horario'
    console.log(`[cron/pendientes] nada que avisar (${motivo}), arrastre: ${arrastre.length}`)
    return NextResponse.json({ ok: true, avisados: 0, pendientes: 0, arrastre: arrastre.length, motivo })
  }

  if (!telegramConfigurado()) {
    // Desplegado y mudo. Se reporta para que el silencio sea VISIBLE en los
    // registros: un cron que no manda nada tiene que poder distinguirse de un
    // cron que no corre.
    console.log(`[cron/pendientes] ${aAvisar.length} pendientes (+${arrastre.length} arrastre), Telegram sin configurar`)
    return NextResponse.json({ ok: true, avisados: 0, pendientes: aAvisar.length, arrastre: arrastre.length, motivo: 'sin-config' })
  }

  const r = await enviarTelegram(textoAviso(aAvisar, ahora, BASE_URL, arrastre.length))
  if (!r.ok) {
    // NO se estampa la marca si el envío falló: así el próximo ciclo reintenta.
    console.error('[cron/pendientes] Telegram falló:', r.motivo)
    return NextResponse.json({ ok: false, avisados: 0, pendientes: aAvisar.length, arrastre: arrastre.length, motivo: r.motivo })
  }

  // Recién ahora se marca, y con await: sin await la función serverless devuelve
  // la respuesta y se congela antes del update, y el aviso se repetiría cada 5
  // minutos para siempre.
  //
  // El arrastre NUNCA pasa por este loop: estamparle `ultimo_aviso_telegram_at` lo
  // silenciaría para siempre (entraría en el enfriamiento de 30 min de un aviso
  // que jamás mandamos). Solo se estampan los de `aAvisar` — los que sí se
  // nombraron en el mensaje que se acaba de mandar.
  for (const c of aAvisar) {
    await marcarAvisoTelegram(c.telefono).catch((e) =>
      console.error('[cron/pendientes] marcar', c.telefono, e?.message || e))
  }

  return NextResponse.json({ ok: true, avisados: aAvisar.length, pendientes: aAvisar.length, arrastre: arrastre.length })
}
