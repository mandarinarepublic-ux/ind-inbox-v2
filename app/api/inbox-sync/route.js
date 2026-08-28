import { NextResponse } from 'next/server'
import { getLista, getMensajes } from '@/lib/mensajes'
import { getContactos } from '@/lib/contactos'
import { contarPendientesPorCanalSupabase, versionInboxSupabase } from '@/lib/inbox-supabase'
import { etagDe, sinCambios } from '@/lib/version-inbox'

// Sync unificado del inbox: UNA sola función en vez de 3 (/api/lista +
// /api/mensajes + /api/contactos) por cada ciclo de polling → 1/3 de las
// invocaciones. Las tres lecturas corren en paralelo.
export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    // ?canal=<phone_id>. Cada bandeja pide la suya; sin parámetro, el número
    // principal (así una pestaña vieja en caché sigue viendo lo de siempre).
    const url = new URL(req.url)
    const canal = url.searchParams.get('canal') || undefined

    // ── Latido ligero (?solo=pendientes) ──────────────────────────────────
    // Lo pide la pantalla cuando está EN PAUSA por inactividad. Devuelve solo
    // el contador —unos bytes— en vez de los 4,36 MB del ciclo completo.
    //
    // ⚠️ Existe para que la pausa no deje al equipo sin aviso: IND tiene UNA
    // sola suscripción de push, así que esa pantalla ES la notificación; y
    // desde el 21-ago la pauta entra por el 3326, que no vive en ningún
    // celular. Sin este latido, la pausa cambiaría unos dólares de tráfico
    // por un lead pagado esperando en silencio.
    if (url.searchParams.get('solo') === 'pendientes') {
      const pendientes = await contarPendientesPorCanalSupabase().catch(() => ({}))
      return NextResponse.json({ pendientes }, {
        // Misma ventana de caché que el ciclo completo, por lo mismo: varias
        // pantallas en pausa comparten una sola ejecución de origen.
        headers: { 'Cache-Control': 's-maxage=2, stale-while-revalidate=4' },
      })
    }

    // ── "¿Cambió algo desde tu última pregunta?" ──────────────────────────
    // Medido el 28-ago en horario de atención: 3 de cada 4 ciclos de IND (74,8%)
    // y 9 de cada 10 de MANDI (93,6%) NO traen nada nuevo. Hasta hoy esos polls
    // devolvían igual ~370 KB completos, y eso es el 63% de la factura de Vercel.
    //
    // Cuesta 5,4 ms (dos max() sobre índices) contra los ~8 viajes del ciclo
    // completo. Si cambió CUALQUIER cosa se manda TODO, igual que siempre: esto
    // NO es un delta y no puede perder un mensaje.
    //
    // ⚠️ Ante la duda se manda todo: `sinCambios` devuelve false si la versión no
    // se pudo calcular. Un falso "no cambió" congelaría la pantalla del vendedor.
    const etagActual = etagDe(await versionInboxSupabase())
    // ⚠️ La versión del cliente viaja por QUERY, no por cabecera.
    //
    // El primer intento usó `If-None-Match` / `ETag`, que es lo estándar, y NO
    // funcionó: el log del borde mostró `cliente=NINGUNO` en todos los polls
    // mientras el servidor calculaba la versión perfecto. O el navegador nunca
    // llegó a capturar el `ETag` de la respuesta, o alguna capa lo quitó — y
    // averiguar cuál de las dos costaba más que sacarse la incógnita de encima.
    // Un parámetro de query y un campo del cuerpo son cosas que ninguna capa
    // intermedia toca.
    //
    // Que la URL cambie con la versión NO rompe nada: el caché compartido del
    // edge ya se quitó (daba 40 MISS de 40), y aunque estuviera, todos los
    // clientes convergen a la MISMA versión, así que compartirían la entrada.
    const etagCliente = url.searchParams.get('v') || req.headers.get('if-none-match')
    if (sinCambios(etagCliente, etagActual)) {
      // 304 sin cuerpo: cero bytes de Fast Origin Transfer.
      return new Response(null, {
        status: 304,
        headers: { ETag: etagActual, 'Cache-Control': 'no-store' },
      })
    }

    const [lista, rows, contactos, pendientes] = await Promise.all([
      getLista(canal),
      getMensajes(canal),
      // Contactos SIN filtro de canal, a proposito. El estado (pendiente, atendido,
      // ARCHIVADO, venta...) vive en la conversacion, y hay UNA por cliente, no una
      // por numero. En cambio la lista se filtra por el canal del MENSAJE.
      //
      // Filtrando los dos igual, un cliente que escribio a los dos numeros aparecia
      // en la lista de un canal mientras su ficha quedaba del lado del otro: la
      // pantalla no encontraba su estado, asumia "pendiente", y ARCHIVAR parecia no
      // funcionar (se guardaba bien y volvia a pintarse pendiente al refrescar).
      getContactos(null),
      // De TODOS los canales, no solo del activo: es lo que alimenta el contador
      // del botón de la otra bandeja.
      contarPendientesPorCanalSupabase().catch(() => ({})),
    ])
    // `v` va en el cuerpo: es de donde el cliente la toma para la próxima vuelta.
    return NextResponse.json({ lista, rows, contactos, pendientes, v: etagActual }, {
      // Cache COMPARTIDO en el edge: varias pestañas que pollean dentro de la misma
      // ventana comparten UNA ejecución de origen. El caché se indexa por URL, y
      // `canal` va en la query, así que cada bandeja tiene su entrada y no se pisan.
      //
      // ⚠️ 2 y 4, NO 5 y 20. Con los valores viejos una respuesta podía servirse
      // con hasta **25 segundos** de antigüedad, y eso produce fantasmas: marcas un
      // chat como atendido, el sondeo trae el valor viejo y el chat REAPARECE en
      // Pendientes. La protección local que tapa eso dura 35 s, así que 25 le
      // dejaba casi nada de margen — y no cubre otra pestaña ni el celular, porque
      // vive en memoria, mientras que este caché es compartido por todos.
      //
      // Estos son los mismos valores que wa-inbox-next ya usa en producción, donde
      // se bajaron el 2-ago por lo mismo: con 5 y 20 un mensaje entrante tardaba
      // ~35-45 s en aparecer. Ese arreglo nunca se había portado acá.
      //
      // ⚠️ 28-ago: el caché compartido SE QUITA y se reemplaza por el ETag. Dos
      // razones, y la primera es una medición: de 40 respuestas seguidas de este
      // endpoint, **40 dieron `cache=MISS`**. Con `s-maxage=2` y polls cada 10 s
      // la entrada siempre expiró antes del siguiente ciclo: no estaba
      // ahorrando NADA. Y la segunda es correctitud: un caché compartido por URL
      // no distingue `If-None-Match`, así que podría guardar un 304 y servírselo
      // a otra pestaña que sí necesitaba el cuerpo.
      //
      // Lo que se pierde (una ejecución compartida entre pestañas) vale $0,75 al
      // mes en invocaciones; lo que se gana son ~$19 en transferencia.
      headers: { ETag: etagActual, 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[/api/inbox-sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
