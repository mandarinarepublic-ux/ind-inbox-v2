'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, Aviso, Cargando, leer, MSG_SOLO_DUENOS } from '@/components/indi/comun'
import Conocimiento from '@/components/indi/Conocimiento'
import Respuestas from '@/components/indi/Respuestas'
import Feriados from '@/components/indi/Feriados'
import Historial from '@/components/indi/Historial'
import Probar from '@/components/indi/Probar'

// ── Pestaña 🧠 INDI: lo que sabe la vendedora automática de IND ───────────────
// Precios, promos, reglas y preguntas fijas (inbox.indi_conocimiento), qué
// respuestas rápidas usa, feriados, historial con deshacer y un chat de prueba.
// Todos ven; solo Rodrigo y Xavier cambian (lo decide el servidor en cada POST;
// /api/indi/permiso es solo para esconder los botones).

const PESTANAS = [
  { id: 'PRECIOS',   label: '💲 Precios y promos' },
  { id: 'REGLAS',    label: '📏 Reglas' },
  { id: 'PREGUNTAS', label: '❓ Preguntas fijas' },
  { id: 'RESPUESTAS',label: '⚡ Respuestas rápidas' },
  { id: 'FERIADOS',  label: '📅 Feriados' },
  { id: 'HISTORIAL', label: '🕘 Historial' },
  { id: 'PROBAR',    label: '🧪 Probar a Indi' },
]

const DE_CONOCIMIENTO = {
  PRECIOS: {
    tipos: [{ tipo: 'precio', nuevo: '+ Precio' }, { tipo: 'promo', nuevo: '+ Promo' }],
    ayuda: 'Lo que Indi cotiza. Una promo necesita fecha de fin: al vencer, Indi deja de ofrecerla sola.',
  },
  REGLAS: {
    tipos: [{ tipo: 'regla', nuevo: '+ Regla' }],
    ayuda: 'Cómo trabaja la tienda: abonos, tiempos, bocetos, envíos… Indi las sigue al pie de la letra.',
  },
  PREGUNTAS: {
    tipos: [{ tipo: 'pregunta', nuevo: '+ Pregunta' }],
    ayuda: 'Preguntas que Indi contesta siempre igual y que no están en ninguna respuesta rápida.',
  },
}

export default function Indi({ active }) {
  const [pestana, setPestana] = useState('PRECIOS')
  const [permiso, setPermiso] = useState(null) // { puedeEditar, nombre }
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)

  const cargarConocimiento = useCallback(async () => {
    try { setFilas(await leer('/api/indi/conocimiento')); setError(null) } catch (e) { setError(e.message) }
  }, [])

  // Recarga CADA VEZ que se entra (como Automatizaciones): si Xavier cambió un
  // precio desde el celular, esta pantalla no puede seguir mostrando el viejo.
  useEffect(() => {
    if (!active) return
    leer('/api/indi/permiso').then(setPermiso).catch(() => setPermiso({ puedeEditar: false, nombre: null }))
    cargarConocimiento()
  }, [active, cargarConocimiento])

  if (!active) return null
  const puedeEditar = !!permiso?.puedeEditar
  const conf = DE_CONOCIMIENTO[pestana]

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%', background: C.bg }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '22px 16px 90px' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.cream, letterSpacing: '.5px' }}>🧠 Indi</div>
          <div style={{ fontSize: 12, color: C.creamDim, marginTop: 4 }}>
            Lo que sabe Indi para contestar a los clientes de IND. Un cambio aquí vale desde su siguiente mensaje.
          </div>
          {permiso && !puedeEditar && (
            <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginTop: 6 }}>🔒 {MSG_SOLO_DUENOS}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
          {PESTANAS.map((p) => {
            const on = pestana === p.id
            return (
              <button key={p.id} onClick={() => setPestana(p.id)} style={{
                padding: '7px 12px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                border: `1px solid ${on ? C.cream : C.border2}`, background: on ? C.cream : 'transparent',
                color: on ? C.bg : C.creamDim, fontWeight: 800, fontSize: 12, fontFamily: 'inherit',
              }}>{p.label}</button>
            )
          })}
        </div>

        {conf && (
          <>
            {error && <Aviso>⚠️ {error}</Aviso>}
            {!filas && !error && <Cargando />}
            {filas && (
              <Conocimiento key={pestana} filas={filas} tipos={conf.tipos} ayuda={conf.ayuda}
                puedeEditar={puedeEditar} onCambio={cargarConocimiento} />
            )}
          </>
        )}
        {pestana === 'RESPUESTAS' && <Respuestas active puedeEditar={puedeEditar} />}
        {pestana === 'FERIADOS' && <Feriados active puedeEditar={puedeEditar} />}
        {pestana === 'HISTORIAL' && <Historial active puedeEditar={puedeEditar} onCambio={cargarConocimiento} />}
        {/* Montado siempre: el chat de prueba sobrevive a ir a mirar un precio y volver. */}
        <div style={{ display: pestana === 'PROBAR' ? 'block' : 'none' }}><Probar /></div>
      </div>
    </div>
  )
}
