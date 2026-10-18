'use client'
import React from 'react'

// ── Piezas compartidas de la pantalla 🧠 INDI (tema IND: crema sobre negro) ──

export const C = {
  bg:'#0A0A0A', surface:'#0D0D0D', surface2:'#111111',
  border:'#1F1F1F', border2:'#2A2A2A',
  cream:'#F4F1EC', creamDim:'#A09A90', creamFaint:'#3A3530',
  green:'#4ade80', amber:'#f59e0b', red:'#ef4444',
}

// Mismo texto que lib/editor-indi.js (no se importa de ahí para no meter el
// código de sesión del servidor en el bundle del navegador).
export const MSG_SOLO_DUENOS = 'Solo Rodrigo y Xavier pueden cambiar a Indi'

// ☠️ `cache: 'no-store'` + `t=` SIEMPRE: Next/el navegador congelan lecturas y
// la pantalla mostraría lo de la primera carga aunque alguien haya cambiado algo.
export async function leer(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' })
  const data = await res.json().catch(() => null)
  // fetch NO lanza con 4xx/5xx: un error del servidor no se puede leer como dato.
  if (!res.ok) throw new Error(data?.error || `${path} devolvió ${res.status}`)
  return data
}

// Devuelve { ok:true, ...respuesta } o { ok:false, error } — nunca lanza.
export async function enviar(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ...data, ok: true } : { ok: false, error: data?.error || `Error ${res.status}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function Card({ children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12, ...style }}>
      {children}
    </div>
  )
}

export function Boton({ children, onClick, disabled, tipo = 'normal', title, style }) {
  const estilos = {
    principal: { background: C.cream, color: C.bg, border: 'none' },
    normal:    { background: 'rgba(244,241,236,.08)', color: C.cream, border: `1px solid ${C.border2}` },
    peligro:   { background: 'transparent', color: C.red, border: '1px solid rgba(239,68,68,.35)' },
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      ...estilos[tipo], borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 800,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, fontFamily: 'inherit',
      whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  )
}

export function Switch({ on, onClick, disabled }) {
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

export const inputBase = {
  width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
  color: C.cream, fontSize: 13, padding: '9px 11px', fontFamily: 'Outfit,sans-serif',
  outline: 'none', boxSizing: 'border-box',
}

// Etiqueta + campo + el error del servidor justo debajo, si es de este campo.
export function Campo({ label, error, children, style }) {
  return (
    <label style={{ display: 'block', marginBottom: 10, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.creamDim, letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      {children}
      {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 4 }}>⚠️ {error}</div>}
    </label>
  )
}

export function Aviso({ children, color = C.red }) {
  return <div style={{ fontSize: 12, color, fontWeight: 700, margin: '6px 0 10px' }}>{children}</div>
}

export function Cargando() {
  return <div style={{ color: C.creamDim, fontSize: 13, padding: 20 }}>Cargando…</div>
}
