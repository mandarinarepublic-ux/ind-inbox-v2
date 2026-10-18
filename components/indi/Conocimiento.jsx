'use client'
import React, { useState } from 'react'
import { C, Card, Boton, Campo, Aviso, inputBase, enviar } from './comun'
import { avisoVencida, fechaCorta, campoDelError, dinero } from '@/lib/indi-vista'

// Pestañas Precios y promos · Reglas · Preguntas fijas: las tres son filas de
// inbox.indi_conocimiento, cambia solo el `tipo` (POST /api/indi/conocimiento).

const NOMBRE_TIPO = { precio: 'precio', promo: 'promo', regla: 'regla', pregunta: 'pregunta' }

function filaVacia(tipo) {
  return { tipo, titulo: '', contenido: '', precio: '', vigente_hasta: '', activo: true, orden: 0 }
}

function aFormulario(f) {
  return {
    id: f.id, tipo: f.tipo, titulo: f.titulo || '', contenido: f.contenido || '',
    precio: f.precio ?? '', vigente_hasta: f.vigente_hasta || '', activo: f.activo !== false, orden: f.orden ?? 0,
  }
}

function Formulario({ inicial, onCancelar, onGuardado }) {
  const [f, setF] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null) // { campo, msg }
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))
  const conPrecio = f.tipo === 'precio' || f.tipo === 'promo'
  const esPromo = f.tipo === 'promo'
  const err = (campo) => (error?.campo === campo ? error.msg : null)

  const guardar = async () => {
    setGuardando(true); setError(null)
    const fila = {
      ...f,
      precio: f.precio === '' ? null : f.precio,
      vigente_hasta: f.vigente_hasta || null,
      orden: f.orden, // lo valida el servidor: '' es 0 y 2,5 o -1 son error
    }
    const r = await enviar('/api/indi/conocimiento', { accion: 'guardar', fila })
    setGuardando(false)
    if (!r.ok) { setError({ campo: campoDelError(r.error), msg: r.error }); return }
    onGuardado(r.fila)
  }

  return (
    <Card style={{ borderColor: C.border2 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: C.cream, marginBottom: 12 }}>
        {f.id ? 'Editar' : 'Nueva'} {NOMBRE_TIPO[f.tipo]}
      </div>
      {err('general') && <Aviso>⚠️ {err('general')}</Aviso>}
      <Campo label={f.tipo === 'pregunta' ? 'PREGUNTA' : 'TÍTULO'} error={err('titulo')}>
        <input value={f.titulo} maxLength={80} onChange={(e) => set('titulo', e.target.value)} style={inputBase} />
      </Campo>
      <Campo label={f.tipo === 'pregunta' ? 'LO QUE INDI CONTESTA' : 'TEXTO'} error={err('contenido')}>
        <textarea value={f.contenido} rows={4} maxLength={1500} onChange={(e) => set('contenido', e.target.value)}
          style={{ ...inputBase, resize: 'vertical' }} />
      </Campo>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {conPrecio && (
          <Campo label="PRECIO ($)" error={err('precio')} style={{ flex: '1 1 130px' }}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={f.precio}
              onChange={(e) => set('precio', e.target.value)} style={inputBase} />
          </Campo>
        )}
        {esPromo && (
          <Campo label="VALE HASTA (obligatorio)" error={err('vigente_hasta')} style={{ flex: '1 1 160px' }}>
            <input type="date" value={f.vigente_hasta} onChange={(e) => set('vigente_hasta', e.target.value)}
              style={{ ...inputBase, colorScheme: 'dark' }} />
          </Campo>
        )}
        <Campo label="ORDEN" error={err('orden')} style={{ flex: '0 1 90px' }}>
          <input type="number" step="1" value={f.orden} onChange={(e) => set('orden', e.target.value)} style={inputBase} />
        </Campo>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.cream, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.activo} onChange={(e) => set('activo', e.target.checked)} />
        Indi la usa (apagada se guarda pero Indi no la dice)
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Boton onClick={onCancelar} disabled={guardando}>Cancelar</Boton>
        <Boton tipo="principal" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
      </div>
    </Card>
  )
}

function FilaConocimiento({ fila, puedeEditar, onEditar, onBorrar }) {
  const vencida = avisoVencida(fila)
  const apagada = !!vencida || fila.activo === false
  return (
    <Card style={{ opacity: apagada ? .5 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            {fila.tipo === 'promo' && <span style={{ fontSize: 10, fontWeight: 900, color: C.amber, letterSpacing: '1px' }}>PROMO</span>}
            <span style={{ fontWeight: 800, fontSize: 14, color: C.cream }}>{fila.titulo}</span>
            {dinero(fila.precio) && <span style={{ fontWeight: 900, fontSize: 14, color: C.green }}>{dinero(fila.precio)}</span>}
          </div>
          {fila.contenido && (
            <div style={{ fontSize: 12.5, color: C.creamDim, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fila.contenido}</div>
          )}
          <div style={{ fontSize: 11, color: C.creamDim, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {vencida && <span style={{ fontWeight: 800 }}>⌛ {vencida}</span>}
            {!vencida && fila.vigente_hasta && <span>Vale hasta el {fechaCorta(fila.vigente_hasta)}</span>}
            {fila.activo === false && <span style={{ fontWeight: 800 }}>Apagada</span>}
            {fila.actualizado_por && <span>Último cambio: {fila.actualizado_por}</span>}
          </div>
        </div>
        {puedeEditar && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Boton onClick={onEditar}>Editar</Boton>
            <Boton tipo="peligro" onClick={onBorrar}>Borrar</Boton>
          </div>
        )}
      </div>
    </Card>
  )
}

// `tipos`: los que se pueden crear desde esta pestaña, con su texto de botón.
export default function Conocimiento({ filas, tipos, ayuda, puedeEditar, onCambio }) {
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const mias = (filas || []).filter((f) => tipos.some((t) => t.tipo === f.tipo))

  const borrar = async (fila) => {
    if (!window.confirm(`¿Borrar "${fila.titulo}"? Se puede deshacer desde Historial.`)) return
    setError(null)
    const r = await enviar('/api/indi/conocimiento', { accion: 'borrar', id: fila.id })
    if (!r.ok) { setError(r.error); return }
    onCambio()
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>{ayuda}</div>
      {puedeEditar && !form && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {tipos.map((t) => <Boton key={t.tipo} tipo="principal" onClick={() => setForm(filaVacia(t.tipo))}>{t.nuevo}</Boton>)}
        </div>
      )}
      {error && <Aviso>⚠️ {error}</Aviso>}
      {form && (
        <Formulario key={form.id || 'nueva'} inicial={form} onCancelar={() => setForm(null)}
          onGuardado={() => { setForm(null); onCambio() }} />
      )}
      {!mias.length && <div style={{ color: C.creamDim, fontSize: 13, padding: '10px 0' }}>Todavía no hay nada aquí.</div>}
      {mias.map((f) => (
        <FilaConocimiento key={f.id} fila={f} puedeEditar={puedeEditar}
          onEditar={() => setForm(aFormulario(f))} onBorrar={() => borrar(f)} />
      ))}
    </div>
  )
}
