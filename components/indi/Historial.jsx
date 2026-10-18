'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, Card, Boton, Aviso, Cargando, leer, enviar } from './comun'
import { accionHistorial, nombreTabla, cambiosDeFila, tituloDeCambio, dinero } from '@/lib/indi-vista'
import { operacionDeshacer } from '@/lib/indi-deshacer'

// Los últimos 100 cambios (inbox.indi_historial, lo llena un trigger) con
// Deshacer. Un deshacer también queda anotado, así que se puede deshacer otra vez.

function horaEcuador(iso) {
  try {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return String(iso || '') }
}

function valorTexto(v, col) {
  if (v === null || v === undefined || v === '') return '—'
  if (col === 'precio') return dinero(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function FilaHistorial({ fila, puedeEditar, onDeshecho }) {
  const [abierta, setAbierta] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const cambios = cambiosDeFila(fila)
  // Misma regla que el servidor: si no hay operación, no se ofrece el botón.
  const op = operacionDeshacer(fila)
  const sePuede = !!op && !(op.tipo === 'restaurar' && !Object.keys(op.datos || {}).length)

  const deshacer = async () => {
    if (!window.confirm('¿Deshacer este cambio?')) return
    setTrabajando(true); setError(null)
    const r = await enviar('/api/indi/historial', { accion: 'deshacer', id: fila.id })
    setTrabajando(false)
    if (!r.ok) { setError(r.error); return }
    onDeshecho()
  }

  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setAbierta((a) => !a)}>
          <div style={{ fontSize: 13, color: C.cream }}>
            <b>{fila.por || 'Alguien'}</b> {accionHistorial(fila).toLowerCase()} <b>{tituloDeCambio(fila)}</b>
          </div>
          <div style={{ fontSize: 11, color: C.creamDim, marginTop: 3 }}>
            {horaEcuador(fila.en)} · {nombreTabla(fila.tabla)} · {abierta ? 'ocultar detalle ▲' : 'ver detalle ▼'}
          </div>
        </div>
        {puedeEditar && sePuede && (
          <Boton onClick={deshacer} disabled={trabajando}>{trabajando ? 'Deshaciendo…' : '↩️ Deshacer'}</Boton>
        )}
      </div>
      {error && <Aviso>⚠️ {error}</Aviso>}
      {abierta && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          {!cambios.length && <div style={{ fontSize: 12, color: C.creamDim }}>Sin cambios visibles.</div>}
          {cambios.map((c) => (
            <div key={c.col} style={{ fontSize: 12, marginBottom: 6, wordBreak: 'break-word' }}>
              <div style={{ color: C.creamDim, fontWeight: 800, fontSize: 10.5, letterSpacing: '.5px' }}>{c.col.toUpperCase()}</div>
              <div style={{ color: C.red, whiteSpace: 'pre-wrap' }}>− {valorTexto(c.antes, c.col)}</div>
              <div style={{ color: C.green, whiteSpace: 'pre-wrap' }}>+ {valorTexto(c.despues, c.col)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function Historial({ active, puedeEditar, onCambio }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    try { setLista(await leer('/api/indi/historial')) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { if (active) cargar() }, [active, cargar])

  return (
    <div>
      <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>
        Cada cambio a Indi queda aquí: quién, cuándo, qué había antes y qué quedó. Deshacer vuelve solo lo que ese
        cambio tocó.
      </div>
      {error && <Aviso>⚠️ {error}</Aviso>}
      {!lista && !error && <Cargando />}
      {(lista || []).map((f) => (
        <FilaHistorial key={f.id} fila={f} puedeEditar={puedeEditar} onDeshecho={() => { cargar(); onCambio?.() }} />
      ))}
      {lista && !lista.length && <div style={{ color: C.creamDim, fontSize: 13 }}>Todavía no hay cambios.</div>}
    </div>
  )
}
