'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, Card, Switch, Aviso, Cargando, leer, enviar } from './comun'

// Respuestas rápidas que Indi puede usar sola (uso_ia). El texto y las fotos se
// editan donde siempre (panel de respuestas del chat); aquí solo el interruptor.
export default function Respuestas({ active, puedeEditar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(null) // id

  const cargar = useCallback(async () => {
    setError(null)
    try { setLista(await leer('/api/indi/respuestas')) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { if (active) cargar() }, [active, cargar])

  const alternar = async (r) => {
    const valor = r.uso_ia === false // apagada → prender; prendida (o sin dato) → apagar
    setGuardando(r.id); setError(null)
    setLista((prev) => prev.map((x) => (x.id === r.id ? { ...x, uso_ia: valor } : x)))
    const res = await enviar('/api/indi/respuestas', { id: r.id, usoIa: valor })
    setGuardando(null)
    if (!res.ok) {
      // No se guardó → el interruptor vuelve donde estaba, sin mentir.
      setLista((prev) => prev.map((x) => (x.id === r.id ? { ...x, uso_ia: r.uso_ia } : x)))
      setError(`No se pudo guardar: ${res.error}`)
    }
  }

  if (!lista && !error) return <Cargando />
  return (
    <div>
      <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>
        Indi elige entre estas respuestas y manda sus fotos tal como están guardadas. Apaga las que no son para que
        Indi las use sola (encuesta, cupones…). El texto se edita en el panel de respuestas del chat.
      </div>
      {error && <Aviso>⚠️ {error}</Aviso>}
      {(lista || []).map((r) => {
        const on = r.uso_ia !== false
        const fotos = Array.isArray(r.imagenes) ? r.imagenes.filter(Boolean) : []
        return (
          <Card key={r.id} style={{ opacity: on ? 1 : .55 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {r.grupo && <div style={{ fontSize: 10, fontWeight: 900, color: C.creamDim, letterSpacing: '1px', marginBottom: 3 }}>{String(r.grupo).toUpperCase()}</div>}
                <div style={{ fontSize: 12.5, color: C.cream, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 90, overflow: 'hidden' }}>{r.texto}</div>
                {fotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {fotos.slice(0, 6).map((u) => (
                      <img key={u} src={u} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border2}` }} />
                    ))}
                    {fotos.length > 6 && <span style={{ fontSize: 11, color: C.creamDim, alignSelf: 'center' }}>+{fotos.length - 6}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Switch on={on} disabled={!puedeEditar || guardando === r.id} onClick={() => alternar(r)} />
                <span style={{ fontSize: 10, color: C.creamDim, fontWeight: 700 }}>{on ? 'Indi la usa' : 'No para Indi'}</span>
              </div>
            </div>
          </Card>
        )
      })}
      {lista && !lista.length && <div style={{ color: C.creamDim, fontSize: 13 }}>No hay respuestas rápidas activas.</div>}
    </div>
  )
}
