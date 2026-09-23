import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { updateEstado, updateModoIA, updateNotas, updateAlias, updateIdVenta, updateEtapa, updateDeuda, updateSinAutomaticos, updateTipoContacto, derivarAPersona } from '@/lib/contactos'
import { traducirEstadoLegado } from '@/lib/gestion'
import { revisarVentaEnProceso } from '@/lib/capi'

export const dynamic = 'force-dynamic'

// PATCH /api/contactos/estado
// Body: { telefono, campo, valor }
// campo: 'estado' | 'modoIA' | 'notas' | 'alias' | 'idVenta' | 'etapa' | 'deuda' | 'sinAutomaticos' | 'tipoContacto'
// (+ 'temperatura' y 'ventaEnProceso' de pestañas con el JS de antes del 22-sep: se aceptan sin romper)
export async function PATCH(req) {
  try {
    // `canal` opcional: el número de ESTA conversación. Sin él, el estado solo
    // se escribe en el lado viejo (una fila por persona) y la bandeja de ese
    // número se queda atrás.
    const { telefono, campo, valor, canal } = await req.json()
    if (!telefono || !campo) {
      return NextResponse.json({ error: 'Faltan campos: telefono, campo' }, { status: 400 })
    }

    let result
    switch (campo) {
      case 'estado': {
        // SOPORTE (lo pide indx-agent al derivar), VENTA y ENCUESTA ya no son
        // bandejas: se traducen al modelo nuevo (lib/gestion.js) sin esconder el chat.
        const t = traducirEstadoLegado(valor)
        if (t.deuda) result = await derivarAPersona(telefono, t.deuda.nota)
        else if (t.estado) result = await updateEstado(telefono, t.estado, canal || '')
        if (t.etapa) result = await updateEtapa(telefono, t.etapa, 'humano')
        if (!result) return NextResponse.json({ error: `Estado desconocido: ${valor}` }, { status: 400 })
        break
      }
      case 'modoIA':
        result = await updateModoIA(telefono, valor) // 'IA' | 'HUMANO'
        break
      case 'notas':
        result = await updateNotas(telefono, valor)
        break
      case 'alias':
        result = await updateAlias(telefono, valor)
        break
      case 'idVenta':
        result = await updateIdVenta(telefono, valor)
        break
      case 'etapa':
        result = await updateEtapa(telefono, valor, 'humano')
        break
      case 'deuda':
        result = await updateDeuda(telefono, valor, 'humano')
        break
      case 'sinAutomaticos':
        result = await updateSinAutomaticos(telefono, valor === true || valor === 'true')
        break
      case 'tipoContacto':
        result = await updateTipoContacto(telefono, valor)
        break
      // Pestañas con el JS viejo: la temperatura ya es automática (se ignora) y
      // 💰 venta en proceso es ahora la etapa 🛒 Falta pedido.
      case 'temperatura':
        result = { ok: true, ignorado: 'la temperatura ahora es automática' }
        break
      case 'ventaEnProceso':
        result = await updateEtapa(telefono, (valor === true || valor === 'true') ? 'falta_pedido' : '', 'humano')
        break
      default:
        return NextResponse.json({ error: `Campo desconocido: ${campo}` }, { status: 400 })
    }

    // Marcar 💳 Esperando pago o 🛒 Falta pedido es, para el negocio, una venta
    // en proceso → InitiateCheckout (antes: 🔥 CALIENTE o SOPORTE, hasta el 22-sep).
    // La función relee las condiciones de la base, así que no hace falta filtrar
    // por `campo` acá: si el agente
    // marcó otra cosa, no se cumple ninguna y no se manda nada.
    //
    // Sin await a propósito: el botón del inbox no puede quedarse esperando a
    // Meta, y si esto falla el cambio de estado ya está guardado igual.
    //
    // Pero SIN await no alcanza: hay que envolverlo en waitUntil(). Una función
    // serverless se puede congelar apenas devuelve la respuesta, y ahí la promesa
    // suelta muere en el aire — la señal no sale y no queda rastro de que faltó,
    // porque el .catch() tampoco llega a correr. waitUntil() es el compromiso de
    // Vercel de mantenerla viva hasta que la promesa termine, sin retrasar ni un
    // milisegundo la respuesta al botón.
    //
    // Este patrón exacto ya costó una factura en el CRM (MAN-AND-5601, disparada
    // sin await justo antes de un router.push). Acá el que se pierde es el
    // InitiateCheckout de un chat marcado 💳 o 🛒 con
    // pocos mensajes y sin foto: el webhook no lo va a rescatar, porque para él
    // ese chat no cumple ninguna condición. Este es su único disparador.
    waitUntil(
      revisarVentaEnProceso(telefono)
        .catch(e => console.error('[/api/contactos/estado] venta capi:', e.message))
    )

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/contactos/estado]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
