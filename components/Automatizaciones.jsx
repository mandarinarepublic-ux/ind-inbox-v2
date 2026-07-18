'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { getAutomatizaciones, saveAutomatizaciones } from '@/lib/api-client'

// ── Pestaña AUTOMATIZACIONES (tema IND: cream sobre negro) ─────────────────────
// Reglas del inbox que se prenden/apagan. Hoy: dos saludos automáticos.

const C = {
  bg:'#0A0A0A', surface:'#0D0D0D', surface2:'#111111',
  border:'#1F1F1F', border2:'#2A2A2A',
  cream:'#F4F1EC', creamDim:'#A09A90', creamFaint:'#3A3530',
  green:'#4ade80', amber:'#f59e0b',
}

function Switch({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on} style={{
      width: 46, height: 26, borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: on ? C.green : C.border2, position: 'relative', transition: 'background .2s', flexShrink: 0,
      opacity: disabled ? .6 : 1,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.5)',
      }} />
    </button>
  )
}

function Card({ children }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18,
      marginBottom: 16,
    }}>{children}</div>
  )
}

export default function Automatizaciones({ active }) {
  const [config,  setConfig]  = useState(null)
  const [orig,    setOrig]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getAutomatizaciones()
    const c = r?.config || {}
    setConfig(c); setOrig(JSON.stringify(c)); setLoading(false)
  }, [])

  useEffect(() => { if (active && !config) cargar() }, [active, config, cargar])

  const dirty = config && orig !== JSON.stringify(config)

  const setBloque = (bloque, campo, valor) =>
    setConfig(prev => ({ ...prev, [bloque]: { ...(prev?.[bloque] || {}), [campo]: valor } }))

  const guardar = async () => {
    setSaving(true)
    const r = await saveAutomatizaciones(config)
    setSaving(false)
    if (r?.ok) {
      const c = r.config || config
      setConfig(c); setOrig(JSON.stringify(c))
      setToast('✅ Guardado')
    } else {
      setToast('❌ ' + (r?.error || 'No se pudo guardar'))
    }
    setTimeout(() => setToast(null), 2500)
  }

  if (!active) return null

  const sn = config?.saludo_nuevo || {}
  const sr = config?.saludo_reactivacion || {}

  const inputBase = {
    width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
    color: C.cream, fontSize: 13, padding: '10px 12px', fontFamily: 'Outfit,sans-serif',
    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%', background: C.bg }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '22px 16px 90px' }}>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.cream, letterSpacing: '.5px' }}>⚙️ Automatizaciones</div>
          <div style={{ fontSize: 12, color: C.creamDim, marginTop: 4 }}>
            Reglas que responden solas por ti. Se aplican cuando la IA está <b style={{ color: C.cream }}>apagada</b> para ese contacto (si está prendida, la IA se encarga).
          </div>
        </div>

        {loading && <div style={{ color: C.creamFaint, fontSize: 13, padding: 20 }}>Cargando…</div>}

        {!loading && config && (<>

          {/* Saludo a contacto NUEVO */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: sn.activo ? 14 : 0 }}>
              <div style={{ fontSize: 26 }}>👋</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.cream }}>Saludo a contacto nuevo</div>
                <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3 }}>
                  Se envía la primera vez que alguien te escribe. Atiende al instante aunque la IA esté apagada.
                </div>
              </div>
              <Switch on={!!sn.activo} onClick={() => setBloque('saludo_nuevo', 'activo', !sn.activo)} />
            </div>
            {sn.activo && (
              <textarea value={sn.texto || ''} onChange={e => setBloque('saludo_nuevo', 'texto', e.target.value)}
                rows={3} placeholder="Escribe el mensaje de bienvenida…" style={inputBase} />
            )}
          </Card>

          {/* Saludo de REACTIVACIÓN */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: sr.activo ? 14 : 0 }}>
              <div style={{ fontSize: 26 }}>🔄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.cream }}>Saludo "hola de vuelta"</div>
                <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3 }}>
                  Cuando un cliente reaparece después de un tiempo sin escribir.
                </div>
              </div>
              <Switch on={!!sr.activo} onClick={() => setBloque('saludo_reactivacion', 'activo', !sr.activo)} />
            </div>
            {sr.activo && (<>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: C.creamDim }}>Se dispara si estuvo callado más de</span>
                <input type="number" min={1} max={720} value={sr.horas ?? 12}
                  onChange={e => setBloque('saludo_reactivacion', 'horas', Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 64, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, fontSize: 14, fontWeight: 800, padding: '6px 8px', textAlign: 'center', fontFamily: 'Outfit,sans-serif', outline: 'none' }} />
                <span style={{ fontSize: 12, color: C.creamDim }}>horas</span>
              </div>
              <textarea value={sr.texto || ''} onChange={e => setBloque('saludo_reactivacion', 'texto', e.target.value)}
                rows={3} placeholder="Escribe el mensaje de reactivación…" style={inputBase} />
            </>)}
          </Card>

          <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 14, padding: 16, textAlign: 'center', color: C.creamFaint, fontSize: 12 }}>
            🚧 Aquí iremos sumando más automatizaciones (seguimiento, fuera de horario, etiquetas…).
          </div>
        </>)}
      </div>

      {/* Barra de guardar */}
      {!loading && config && (
        <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, display: 'flex', justifyContent: 'center' }}>
          <button onClick={guardar} disabled={!dirty || saving}
            style={{ padding: '11px 34px', borderRadius: 12, border: 'none', background: dirty ? C.cream : C.border, color: dirty ? C.bg : C.creamFaint, fontWeight: 900, fontSize: 14, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily: 'Outfit,sans-serif', minWidth: 200 }}>
            {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 74, left: '50%', transform: 'translateX(-50%)', background: C.surface2, border: `1px solid ${C.border}`, color: C.cream, padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 300, boxShadow: '0 8px 30px rgba(0,0,0,.6)' }}>{toast}</div>
      )}
    </div>
  )
}
