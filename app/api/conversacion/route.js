import { NextResponse } from 'next/server'
import { getMensajes } from '@/lib/mensajes'
import { parseDate } from '@/lib/utils'
import { usaSupabaseLectura } from '@/lib/supabase'
import { getConversacionSupabase } from '@/lib/inbox-supabase'

export const dynamic = 'force-dynamic'

const soloDigitos = (s) => String(s || '').replace(/\D/g, '')

// GET /api/conversacion?phone=...&limite=40
// Devuelve el hilo [{ role:'user'|'assistant', content }] para que el agente de IA
// (indx-agent) tenga MEMORIA sin necesitar credenciales de Google. El inbox sí las
// tiene, así que el agente delega la lectura aquí.
// ENTRANTE→user, SALIENTE→assistant. Fusiona turnos consecutivos del mismo rol y
// quita el último si es del usuario (es el mensaje que se está por responder).
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const phone  = soloDigitos(searchParams.get('phone') || '')
    const limite = parseInt(searchParams.get('limite') || '40', 10)
    if (!phone) return NextResponse.json({ error: 'Falta phone' }, { status: 400 })

    // Modo Supabase: el hilo sale de inbox.mensajes (así el bot lee Supabase sin cambios).
    if (usaSupabaseLectura()) {
      return NextResponse.json(await getConversacionSupabase(phone, limite))
    }

    const all = await getMensajes()
    const msgs = all
      .filter(m => {
        const cel = soloDigitos(m.telefono)
        return cel === phone || cel.endsWith(phone.slice(-9)) || phone.endsWith(cel.slice(-9))
      })
      .filter(m => String(m.mensaje || '').trim()) // el agente razona sobre texto
      .sort((a, b) => parseDate(a.timestamp) - parseDate(b.timestamp))

    const turnos = []
    for (const m of msgs) {
      const role = m.direccion === 'SALIENTE' ? 'assistant' : 'user'
      const content = String(m.mensaje).trim()
      const prev = turnos[turnos.length - 1]
      if (prev && prev.role === role) prev.content += `\n${content}`
      else turnos.push({ role, content })
    }
    if (turnos.length && turnos[turnos.length - 1].role === 'user') turnos.pop()

    return NextResponse.json(turnos.slice(-limite))
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
