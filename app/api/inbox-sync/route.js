import { NextResponse } from 'next/server'
import { getLista, getMensajes } from '@/lib/mensajes'
import { getContactos } from '@/lib/contactos'
import { contarPendientesPorCanalSupabase } from '@/lib/inbox-supabase'

// Sync unificado del inbox: UNA sola función en vez de 3 (/api/lista +
// /api/mensajes + /api/contactos) por cada ciclo de polling → 1/3 de las
// invocaciones. Las tres lecturas corren en paralelo.
export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    // ?canal=<phone_id>. Cada bandeja pide la suya; sin parámetro, el número
    // principal (así una pestaña vieja en caché sigue viendo lo de siempre).
    const canal = new URL(req.url).searchParams.get('canal') || undefined
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
    return NextResponse.json({ lista, rows, contactos, pendientes }, {
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
      headers: { 'Cache-Control': 's-maxage=2, stale-while-revalidate=4' },
    })
  } catch (err) {
    console.error('[/api/inbox-sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
