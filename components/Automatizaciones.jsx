'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { getAutomatizaciones, saveAutomatizaciones } from '@/lib/api-client'
import { CANALES } from '@/lib/canales'

// ── Pestaña AUTOMATIZACIONES (tema IND: cream sobre negro) ─────────────────────
// Reglas del inbox que se prenden/apagan. Hoy: cortafuegos del bot por número +
// dos saludos automáticos + seguimiento por temperatura (con botones).

const C = {
  bg:'#0A0A0A', surface:'#0D0D0D', surface2:'#111111',
  border:'#1F1F1F', border2:'#2A2A2A',
  cream:'#F4F1EC', creamDim:'#A09A90', creamFaint:'#3A3530',
  green:'#4ade80', amber:'#f59e0b', red:'#ef4444',
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

  // Recarga CADA VEZ que se entra a la pestaña (no solo la primera): si el
  // dueño apaga el cortafuegos desde el celular, un escritorio con esta
  // pestaña abierta debe dejar de mostrar lo viejo al volver a mirarla. Sin
  // esto, además, "Guardar cambios" reenviaría ese `config` viejo completo y
  // desarmaría en la base lo que se apagó desde el otro lado.
  //
  // OJO con las dependencias: `config` NO va en el arreglo. `cargar()` hace
  // setConfig(...), así que si `config` estuviera aquí cada carga dispararía
  // el efecto de nuevo → bucle infinito.
  useEffect(() => { if (active) cargar() }, [active, cargar])

  const dirty = config && orig !== JSON.stringify(config)

  const setBloque = (bloque, campo, valor) =>
    setConfig(prev => ({ ...prev, [bloque]: { ...(prev?.[bloque] || {}), [campo]: valor } }))

  // Los INTERRUPTORES se guardan solos, sin pasar por "Guardar cambios".
  //
  // Antes solo cambiaban el estado visual: el switch se veía apagado, la
  // automatización seguía prendida en la base y los saludos seguían saliendo a
  // clientes reales. Un interruptor que miente sobre si algo está enviando
  // mensajes no puede depender de que además te acuerdes de apretar Guardar.
  //
  // Se manda un patch MÍNIMO (solo el bloque tocado): así una edición de texto a
  // medio escribir no se guarda de contrabando y el botón Guardar sigue pidiéndola.
  const guardarInterruptor = async (patch, aplicar) => {
    const previa = config
    setConfig(aplicar(previa))
    setSaving(true)
    const r = await saveAutomatizaciones(patch)
    setSaving(false)
    if (r?.ok) {
      setOrig(JSON.stringify(r.config || {}))
      setToast('✅ Guardado')
    } else {
      setConfig(previa) // no se guardó → el switch vuelve donde estaba, sin mentir
      setToast('❌ No se pudo guardar: ' + (r?.error || 'reintenta'))
    }
    setTimeout(() => setToast(null), 2500)
  }

  // INTERRUPTOR GENERAL de los flujos publicados (el botón de pánico de FLUJOS).
  // `!== false` y no `!!`: el default es PRENDIDO, así que una config vieja sin
  // el bloque `flujos` tiene que verse prendida.
  const flujosOn = config?.flujos?.activo !== false
  const togFlujos = (valor) => guardarInterruptor(
    { flujos: { activo: valor } },
    prev => ({ ...prev, flujos: { ...(prev?.flujos || {}), activo: valor } }))

  const togBloque = (bloque, valor) => guardarInterruptor(
    { [bloque]: { activo: valor } },
    prev => ({ ...prev, [bloque]: { ...(prev?.[bloque] || {}), activo: valor } }))

  // Cortafuegos del bot de IND, por canal. Patch PLANO ({ia:{[canalId]:valor}}):
  // el merge del servidor es de un solo nivel y con booleanos eso alcanza; anidar
  // {activo} habría borrado el canal hermano.
  const togIA = (canalId, valor) => guardarInterruptor(
    { ia: { [canalId]: valor } },
    prev => ({ ...prev, ia: { ...(prev?.ia || {}), [canalId]: valor } }))

  // Seguimientos: config anidada (global + por temperatura). Ojo: el merge del
  // servidor es de UN nivel, por eso los interruptores por temperatura mandan
  // el bloque de esa temperatura COMPLETO — un patch con solo {activo} borraría
  // las horas, el texto y los botones.
  const setSegT = (sub, campo, valor) =>
    setConfig(prev => ({ ...prev, seguimientos: {
      ...(prev?.seguimientos || {}),
      [sub]: { ...((prev?.seguimientos || {})[sub] || {}), [campo]: valor },
    } }))
  const togSegG = (valor) => guardarInterruptor(
    { seguimientos: { activo: valor } },
    prev => ({ ...prev, seguimientos: { ...(prev?.seguimientos || {}), activo: valor } }))
  const togSegT = (key, valor, actual) => guardarInterruptor(
    { seguimientos: { [key]: { ...actual, activo: valor } } },
    prev => ({ ...prev, seguimientos: { ...(prev?.seguimientos || {}),
      [key]: { ...((prev?.seguimientos || {})[key] || {}), activo: valor } } }))
  // Botones de respuesta rápida por temperatura: hasta 3, 20 letras (límite de
  // WhatsApp). Se editan como texto; el que quede vacío no se manda.
  const botonesDe = (t) => (Array.isArray(t.botones) ? t.botones : []).map(b => (b && typeof b === 'object') ? String(b.title || '') : String(b || ''))
  const setBoton = (key, t, i, title) => {
    const bs = botonesDe(t); bs[i] = title.slice(0, 20)
    setSegT(key, 'botones', bs.map(title => ({ title })))
  }
  const addBoton = (key, t) => { const bs = botonesDe(t); if (bs.length < 3) setSegT(key, 'botones', [...bs, ''].map(title => ({ title }))) }
  const delBoton = (key, t, i) => { const bs = botonesDe(t); bs.splice(i, 1); setSegT(key, 'botones', bs.map(title => ({ title }))) }

  // 🔄 Reactivación (fase 3). El interruptor manda el bloque COMPLETO: el merge del
  // servidor es de un nivel y un patch con solo {activo} borraría horas y textos.
  const togReactivacion = (valor) => guardarInterruptor(
    { reactivacion: { ...rc, activo: valor } },
    prev => ({ ...prev, reactivacion: { ...(prev?.reactivacion || {}), activo: valor } }))
  // Horarios editables (se acotan en el servidor: lib/reactivacion.js parametrosReactivacion).
  const setCampoReact = (campo, valor) => setConfig(prev => ({ ...prev, reactivacion: { ...(prev?.reactivacion || {}), [campo]: valor } }))
  const setHoraToque = (i, valor) => setConfig(prev => {
    const r = prev?.reactivacion || {}
    const horas = [...(Array.isArray(r.horas) ? r.horas : [3, 12, 20])]
    horas[i] = valor === '' ? '' : Number(valor)
    return { ...prev, reactivacion: { ...r, horas } }
  })
  const setTextoReact = (etapa, i, texto) => setConfig(prev => {
    const r = prev?.reactivacion || {}
    const lista = [...((r.textos || {})[etapa] || ['', '', ''])]
    lista[i] = texto
    return { ...prev, reactivacion: { ...r, textos: { ...(r.textos || {}), [etapa]: lista } } }
  })

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
  const sg = config?.seguimientos || {}
  const rc = config?.reactivacion || {}

  // Las reglas por temperatura (🔥 🌤️ ❄️) se quitaron el 22-sep-2026: la temperatura
  // ahora es automática y los flujos marcaban 🌤️ a toda la pauta. Queda la encuesta.
  const TEMPS = [
    // Aplica a cualquier chat en ATENDIDO donde contesté yo y el cliente no volvió
    // a escribir. La respuesta del cliente lo devuelve a PENDIENTES.
    { key: 'encuesta', icon: '📋', label: 'Encuesta de reactivación', color: '#f472b6', ayuda: 'Para chats en ATENDIDO que se quedaron callados después de tu respuesta. No se le manda a chats con 📌, 🤫 o contactos internos.', horasDefault: 6, horasLabel: ['Envía a las', 'h de mi último mensaje, si el cliente no respondió'] },
  ]
  const inputNum = { width: 60, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, fontSize: 14, fontWeight: 800, padding: '6px 8px', textAlign: 'center', fontFamily: 'Outfit,sans-serif', outline: 'none' }

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

          {/* FLUJOS: interruptor general. Arriba, junto al otro botón de pánico. */}
          <div style={{ background: C.surface, border: `1px solid ${flujosOn ? C.border : 'rgba(239,68,68,.40)'}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.cream, marginBottom: 4 }}>🧭 FLUJOS</div>
                <div style={{ fontSize: 12, color: C.creamDim }}>
                  Interruptor general de los flujos publicados (pestaña FLUJOS). Apagado,
                  ningún flujo manda nada, sin tener que despublicarlos uno por uno.
                </div>
                {!flujosOn && (
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: C.red }}>⛔ APAGADOS — ningún flujo está mandando nada</div>
                )}
              </div>
              <Switch on={flujosOn} onClick={() => togFlujos(!flujosOn)} />
            </div>
          </div>

          {/* CORTAFUEGOS: apaga el bot de IND entero en un número. Va PRIMERO a
              propósito — es el botón de pánico, no puede estar enterrado abajo. */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.cream, marginBottom: 4 }}>🤖 IND AGENT</div>
            <div style={{ fontSize: 12, color: C.creamDim, marginBottom: 12 }}>
              Respuestas automáticas del bot, por número. Apagarlo aquí lo detiene en
              TODOS los chats de ese número, sin cambiar el ajuste de cada chat: al
              volver a prenderlo, cada conversación vuelve a como estaba.
            </div>
            {CANALES.map(c => {
              const on = config?.ia?.[c.id] !== false
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '10px 12px', borderRadius: 10, marginTop: 8,
                  background: on ? 'rgba(74,222,128,.06)' : 'rgba(239,68,68,.12)',
                  border: `1px solid ${on ? 'rgba(74,222,128,.20)' : 'rgba(239,68,68,.40)'}`,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.cream }}>{c.etiqueta}</div>
                    <div style={{ fontSize: 11, color: C.creamDim }}>{c.titulo}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: on ? C.green : C.red }}>
                      {/* "on" solo dice que ESTE candado no está bloqueando. No es
                          prueba de que el bot esté respondiendo: puede seguir mudo
                          por el interruptor maestro, por el modo del chat, o porque
                          el agente esté fallando. Por eso el texto encendido no
                          afirma un resultado, solo describe el candado. El texto
                          apagado sí es una afirmación segura: apagar aquí SIEMPRE
                          detiene el bot, pase lo que pase con lo demás. */}
                      {on ? 'Sin bloquear' : '⛔ DETENIDO — el bot no contesta en este número'}
                    </div>
                  </div>
                  <Switch on={on} onClick={() => togIA(c.id, !on)} />
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 12, lineHeight: 1.5 }}>
              ⚠️ Ojo: esto NO es el único interruptor del bot. Hay otro más general,
              aparte de esta pantalla, que puede tener al bot completamente callado en
              los dos números a la vez. Apagar aquí SÍ detiene el bot en ese número,
              pase lo que pase con el otro interruptor. Pero prender aquí NO garantiza
              que el bot hable: si ese otro interruptor sigue apagado, seguirá en
              silencio aunque este switch esté en verde.
            </div>
          </div>

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
              <Switch on={!!sn.activo} onClick={() => togBloque('saludo_nuevo', !sn.activo)} />
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
              <Switch on={!!sr.activo} onClick={() => togBloque('saludo_reactivacion', !sr.activo)} />
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

          {/* ── 🔄 REACTIVACIÓN por etapa (fase 3, cron cada hora) ── */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: rc.activo ? 14 : 0 }}>
              <div style={{ fontSize: 26 }}>🔄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.cream }}>Reactivación de clientes callados</div>
                <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3 }}>
                  Le escribe solo a un cliente en <b style={{ color: C.cream }}>💬 Cotizando o 💳 Esperando pago</b> que no contestó después de nuestro mensaje:
                  solo si ya lo atendió una <b style={{ color: C.cream }}>persona</b> (no un flujo ni la IA). <b style={{ color: C.cream }}>Nunca</b> de noche, ni con 📌, 🤫, pedido creado o contacto interno.
                  Se corta apenas el cliente o una persona escribe. Usa <code>{'{nombre}'}</code> para el nombre de pila.
                </div>
              </div>
              <Switch on={!!rc.activo} onClick={() => togReactivacion(!rc.activo)} />
            </div>
            {/* Horarios editables */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 4 }}>
              {[0, 1, 2].map(i => (
                <label key={i} style={{ fontSize: 11, color: C.creamDim }}>
                  Toque {i + 1}: a las
                  <input type="number" min={1} max={23} value={(rc.horas || [3, 12, 20])[i] ?? ''} onChange={e => setHoraToque(i, e.target.value)} style={{ ...inputNum, margin: '0 6px' }} />
                  h de su último mensaje
                </label>
              ))}
              <label style={{ fontSize: 11, color: C.creamDim }}>
                Esperar al menos
                <input type="number" min={1} max={12} value={rc.silencio_min_h ?? 3} onChange={e => setCampoReact('silencio_min_h', Number(e.target.value))} style={{ ...inputNum, margin: '0 6px' }} />
                h desde que escribió el vendedor
              </label>
              <label style={{ fontSize: 11, color: C.creamDim }}>
                Separar los toques
                <input type="number" min={2} max={12} value={rc.entre_toques_h ?? 4} onChange={e => setCampoReact('entre_toques_h', Number(e.target.value))} style={{ ...inputNum, margin: '0 6px' }} />
                h como mínimo
              </label>
              <label style={{ fontSize: 11, color: C.creamDim }}>
                Solo entre las
                <input type="number" min={6} max={12} value={rc.hora_desde ?? 8} onChange={e => setCampoReact('hora_desde', Number(e.target.value))} style={{ ...inputNum, margin: '0 6px' }} />
                y las
                <input type="number" min={14} max={22} value={rc.hora_hasta ?? 22} onChange={e => setCampoReact('hora_hasta', Number(e.target.value))} style={{ ...inputNum, margin: '0 6px' }} />
                h (Ecuador)
              </label>
            </div>
            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 6 }}>Límites de seguridad: nunca antes de las 06:00 ni después de las 22:00, y nunca más de 3 toques por ventana. Deja un texto vacío para no mandar ese toque.</div>
            {[['cotizando', '💬 Cotizando'], ['esperando_pago', '💳 Esperando pago']].map(([etapa, titulo]) => (
              <div key={etapa} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.cream, marginBottom: 6 }}>{titulo}</div>
                {(rc.horas || [3, 12, 20]).map((h, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.creamDim, marginBottom: 3 }}>Toque {i + 1} · a las {h} h</div>
                    <textarea value={((rc.textos || {})[etapa] || [])[i] || ''} onChange={e => setTextoReact(etapa, i, e.target.value)}
                      rows={2} style={{ ...inputBase, resize: 'vertical' }} />
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 6 }}>Los textos se guardan con el botón Guardar de abajo.</div>
          </Card>

          {/* ── ENCUESTA a chats callados (cron cada hora) ── */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: sg.activo ? 14 : 0 }}>
              <div style={{ fontSize: 26 }}>📋</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.cream }}>Encuesta a chats que se quedaron callados</div>
                <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3 }}>
                  Escribe solo a chats atendidos donde el cliente no volvió a contestar — <b style={{ color: C.cream }}>siempre dentro de la ventana de 24h</b> de WhatsApp. Máx 1 mensaje por ventana; se cancela si el cliente responde. Si el bot está contestando ese chat, no se mete.
                </div>
              </div>
              <Switch on={!!sg.activo} onClick={() => togSegG(!sg.activo)} />
            </div>

            {sg.activo && (<>
              {TEMPS.map(({ key, icon, label, color, ayuda, horasDefault, horasLabel }) => {
                const t = sg[key] || {}
                const bs = botonesDe(t)
                return (
                  <div key={key} style={{ border: `1px solid ${t.activo ? color + '55' : C.border}`, borderRadius: 12, padding: 12, marginBottom: 10, background: t.activo ? color + '0c' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: t.activo ? color : C.creamDim }}>{label}</div>
                        <div style={{ fontSize: 11, color: C.creamDim, marginTop: 2 }}>{ayuda}</div>
                      </div>
                      <Switch on={!!t.activo} onClick={() => togSegT(key, !t.activo, t)} />
                    </div>
                    {t.activo && (<>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: C.creamDim }}>{horasLabel[0]}</span>
                        <input type="number" min={1} max={24} value={t.horas ?? horasDefault}
                          onChange={e => setSegT(key, 'horas', Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                          style={inputNum} />
                        <span style={{ fontSize: 12, color: C.creamDim }}>{horasLabel[1]}</span>
                      </div>
                      <textarea value={t.texto || ''} onChange={e => setSegT(key, 'texto', e.target.value)}
                        rows={key === 'encuesta' ? 5 : 3} placeholder={key === 'encuesta' ? 'Texto de la encuesta…' : `Mensaje de seguimiento para leads ${label.toLowerCase()}…`} style={inputBase} />

                      {/* Botones de respuesta rápida (opcionales). Lo que el cliente
                          toque entra al chat como texto y lo devuelve a PENDIENTES. */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.creamDim, marginBottom: 6 }}>
                          🔘 Botones de respuesta (opcional, máx 3 · 20 letras c/u)
                        </div>
                        {bs.map((title, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <input value={title} maxLength={20} placeholder={`Botón ${i + 1}`}
                              onChange={e => setBoton(key, t, i, e.target.value)}
                              style={{ ...inputBase, padding: '8px 10px', resize: 'none' }} />
                            <span style={{ fontSize: 10, color: C.creamFaint, width: 34, textAlign: 'right' }}>{title.length}/20</span>
                            <button onClick={() => delBoton(key, t, i)} title="Quitar botón"
                              style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.creamDim, borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                          </div>
                        ))}
                        {bs.length < 3 && (
                          <button onClick={() => addBoton(key, t)}
                            style={{ background: 'transparent', border: `1px dashed ${C.border2}`, color: C.creamDim, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'Outfit,sans-serif' }}>
                            + Agregar botón
                          </button>
                        )}
                        {bs.length > 0 && (
                          <div style={{ fontSize: 11, color: C.creamFaint, marginTop: 6 }}>
                            Con botones el mensaje sale como interactivo de WhatsApp. La respuesta llega al chat como texto y lo pone en PENDIENTES; ningún botón hace nada solo.
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                )
              })}

              <div style={{ fontSize: 11, color: C.creamDim, marginTop: 4, lineHeight: 1.5 }}>
                ⚠️ Pasadas las 24h la ventana se cierra y ya no se envía gratis (reenganche por plantilla = próximamente). El cron corre cada hora en punto.
              </div>
            </>)}
          </Card>

          <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 14, padding: 16, textAlign: 'center', color: C.creamFaint, fontSize: 12 }}>
            🚧 Aquí iremos sumando más automatizaciones (fuera de horario, etiquetas…).
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
