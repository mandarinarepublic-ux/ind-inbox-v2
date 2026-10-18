'use client'
import React, { useState, useRef, useEffect } from 'react'
import { C, Boton, inputBase, enviar } from './comun'
import { historialParaAgente, burbujasDeRespuesta } from '@/lib/indi-vista'

// Chat de prueba: escribes como cliente y ves qué contestaría Indi con lo que
// sabe HOY. No se manda nada a WhatsApp (POST /api/indi/probar). El historial
// vive solo en esta pantalla y se manda entero en cada mensaje.
export default function Probar() {
  const [chat, setChat] = useState([]) // [{ de:'cliente'|'indi'|'aviso'|'error', texto, imagenes? }]
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const finRef = useRef(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat, esperando])

  const mandar = async () => {
    const mensaje = texto.trim()
    if (!mensaje || esperando) return
    const historial = historialParaAgente(chat) // lo de ANTES de este mensaje
    setChat((prev) => [...prev, { de: 'cliente', texto: mensaje }])
    setTexto(''); setEsperando(true)
    const r = await enviar('/api/indi/probar', { mensaje, historial })
    setEsperando(false)
    if (!r.ok) { setChat((prev) => [...prev, { de: 'error', texto: r.error }]); return }
    setChat((prev) => [...prev, ...burbujasDeRespuesta(r)])
  }

  const burbuja = (m, i) => {
    if (m.de === 'aviso' || m.de === 'error') {
      return (
        <div key={i} style={{
          alignSelf: 'center', maxWidth: '90%', fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '7px 12px',
          color: m.de === 'aviso' ? C.amber : C.red,
          background: m.de === 'aviso' ? 'rgba(245,158,11,.10)' : 'rgba(239,68,68,.10)',
          border: `1px solid ${m.de === 'aviso' ? 'rgba(245,158,11,.35)' : 'rgba(239,68,68,.35)'}`,
        }}>{m.de === 'aviso' ? '🙋 ' : '⚠️ '}{m.texto}</div>
      )
    }
    const cliente = m.de === 'cliente'
    return (
      <div key={i} style={{
        alignSelf: cliente ? 'flex-end' : 'flex-start', maxWidth: '82%', borderRadius: 14, padding: '9px 12px',
        background: cliente ? C.cream : C.surface2, color: cliente ? C.bg : C.cream,
        border: cliente ? 'none' : `1px solid ${C.border2}`, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {!cliente && <div style={{ fontSize: 10, fontWeight: 900, color: C.creamDim, letterSpacing: '1px', marginBottom: 3 }}>🧠 INDI</div>}
        {m.texto}
        {m.imagenes?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: m.texto ? 8 : 0 }}>
            {m.imagenes.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border2}` }} />
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>
        Escribe como si fueras un cliente. Indi contesta con lo que sabe ahora mismo (precios, promos, reglas y
        respuestas rápidas). No se manda nada a WhatsApp.
        <div style={{ marginTop: 4, fontWeight: 700 }}>La prueba no ve pedidos de clientes reales.</div>
      </div>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12,
        minHeight: 260, maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {!chat.length && <div style={{ color: C.creamDim, fontSize: 13, margin: 'auto' }}>Escribe algo, por ejemplo: “¿cuánto cuesta una camiseta?”</div>}
        {chat.map(burbuja)}
        {esperando && <div style={{ alignSelf: 'flex-start', color: C.creamDim, fontSize: 12 }}>Indi está escribiendo…</div>}
        <div ref={finRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <textarea value={texto} rows={2} placeholder="Mensaje del cliente…" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar() } }}
          style={{ ...inputBase, resize: 'none', flex: 1 }} />
        <Boton tipo="principal" onClick={mandar} disabled={esperando || !texto.trim()}>Enviar</Boton>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Boton onClick={() => setChat([])} disabled={esperando || !chat.length}>Empezar de nuevo</Boton>
      </div>
    </div>
  )
}
