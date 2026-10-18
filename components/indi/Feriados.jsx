'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, Card, Boton, Campo, Aviso, Cargando, inputBase, leer, enviar } from './comun'
import { fechaCorta, campoDelError } from '@/lib/indi-vista'

// Días sin despacho (inbox.indi_feriados). Guardar una fecha que ya existe le
// cambia el nombre (upsert por fecha).
export default function Feriados({ active, puedeEditar }) {
  const [lista, setLista] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [form, setForm] = useState({ fecha: '', nombre: '' })
  const [error, setError] = useState(null) // { campo, msg }
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try { setLista(await leer('/api/indi/feriados')) } catch (e) { setErrorCarga(e.message) }
  }, [])
  useEffect(() => { if (active) cargar() }, [active, cargar])

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await enviar('/api/indi/feriados', { accion: 'guardar', fecha: form.fecha, nombre: form.nombre })
    setGuardando(false)
    if (!r.ok) { setError({ campo: campoDelError(r.error), msg: r.error }); return }
    setForm({ fecha: '', nombre: '' })
    cargar()
  }

  const borrar = async (f) => {
    if (!window.confirm(`¿Borrar el feriado "${f.nombre}" (${fechaCorta(f.fecha)})?`)) return
    const r = await enviar('/api/indi/feriados', { accion: 'borrar', fecha: f.fecha })
    if (!r.ok) { setErrorCarga(r.error); return }
    cargar()
  }

  const err = (campo) => (error?.campo === campo ? error.msg : null)
  // Del más próximo al más lejano; los que ya pasaron, al final y apagados.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

  return (
    <div>
      <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>
        Días en que no hay despacho: Indi los salta al calcular cuándo está listo un pedido. Cámbialos solo cuando el
        gobierno mueva un feriado.
      </div>
      {puedeEditar && (
        <Card style={{ borderColor: C.border2 }}>
          {err('general') && <Aviso>⚠️ {err('general')}</Aviso>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Campo label="FECHA" error={err('fecha')} style={{ flex: '1 1 150px' }}>
              <input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                style={{ ...inputBase, colorScheme: 'dark' }} />
            </Campo>
            <Campo label="NOMBRE" error={err('nombre')} style={{ flex: '2 1 200px' }}>
              <input value={form.nombre} maxLength={60} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} style={inputBase} />
            </Campo>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Boton tipo="principal" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar feriado'}</Boton>
          </div>
        </Card>
      )}
      {errorCarga && <Aviso>⚠️ {errorCarga}</Aviso>}
      {!lista && !errorCarga && <Cargando />}
      {(lista || []).map((f) => (
        <div key={f.fecha} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: `1px solid ${C.border}`,
          opacity: f.fecha < hoy ? .45 : 1,
        }}>
          <div style={{ width: 110, flexShrink: 0, fontWeight: 800, fontSize: 13, color: C.cream }}>{fechaCorta(f.fecha)}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.creamDim }}>{f.nombre}</div>
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Boton onClick={() => { setForm({ fecha: f.fecha, nombre: f.nombre }); setError(null) }}>Editar</Boton>
              <Boton tipo="peligro" onClick={() => borrar(f)}>Borrar</Boton>
            </div>
          )}
        </div>
      ))}
      {lista && !lista.length && <div style={{ color: C.creamDim, fontSize: 13 }}>No hay feriados cargados.</div>}
    </div>
  )
}
