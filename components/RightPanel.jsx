'use client'
import { useState, useRef, useEffect } from 'react'
import { Avatar } from '@/components/Components'
import { fetchRepliesFromSheet, writeReply, saveNotes, setIdVenta, fetchProductos } from '@/lib/api-client'
import { parseDate } from '@/lib/utils'
import { CFG } from '@/lib/config'

const IMGBB_KEY = '2307574d43689522feabd27cff3443df'
const MAX_IMGS  = 10

const C = {
  bg:        '#0A0A0A', surface:'#0D0D0D', surface2:'#111111',
  border:    '#1F1F1F', border2:'#2A2A2A',
  cream:     '#F4F1EC', creamDim:'#A09A90', creamFaint:'#3A3530',
}

async function toJpeg(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(new File([blob], 'imagen.jpg', { type:'image/jpeg' })), 'image/jpeg', 0.92)
    }
    img.src = url
  })
}

async function uploadToImgbb(file) {
  const converted = await toJpeg(file)
  const fd = new FormData(); fd.append('image', converted)
  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:'POST', body:fd })
  const data = await res.json()
  return data.success ? data.data.url : ''
}

// Extrae todas las urls de imagen de un reply
function getImgUrls(reply) {
  return Array.from({length: MAX_IMGS}, (_, i) =>
    i === 0 ? (reply.imageUrl || '') : (reply[`imageUrl${i+1}`] || '')
  ).filter(Boolean)
}

// Convierte array de urls a objeto reply { imageUrl, imageUrl2, ... }
function urlsToReply(urls) {
  const obj = {}
  for (let i = 0; i < MAX_IMGS; i++) {
    const key = i === 0 ? 'imageUrl' : `imageUrl${i+1}`
    obj[key] = urls[i] || ''
  }
  return obj
}

// ── MultiImgEditor — editor de hasta 10 fotos ────────────────────
function MultiImgEditor({ urls, onChange }) {
  const [uploading, setUploading] = useState({})
  const refs = Array.from({length: MAX_IMGS}, () => useRef(null))

  const handleFile = async (e, idx) => {
    const f = e.target.files[0]; if (!f) return
    setUploading(p => ({...p, [idx]: true}))
    try {
      const url = await uploadToImgbb(f)
      if (url) {
        const next = [...urls]
        next[idx] = url
        // compactar — quitar huecos
        const compacted = next.filter(Boolean)
        onChange(compacted)
      }
    } finally {
      setUploading(p => ({...p, [idx]: false}))
      if (refs[idx].current) refs[idx].current.value = ''
    }
  }

  const removeImg = (idx) => {
    const next = urls.filter((_, i) => i !== idx)
    onChange(next)
  }

  // Slots a mostrar: fotos existentes + 1 vacío (si hay espacio)
  const slots = urls.length < MAX_IMGS ? [...urls, null] : urls

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
      {slots.map((url, idx) => (
        <div key={idx} style={{ position:'relative', width:44, height:44 }}>
          {url ? (
            <>
              <img src={url} style={{ width:44, height:44, borderRadius:6, objectFit:'cover', display:'block' }} alt=""
                onError={e => e.currentTarget.style.display='none'} />
              {uploading[idx] && (
                <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)', borderRadius:6,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#F4F1EC' }}>↑</div>
              )}
              <button onClick={() => removeImg(idx)}
                style={{ position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:'50%',
                  background:'#f87171', border:'none', color:'#fff', fontSize:8,
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
            </>
          ) : (
            <>
              <button onClick={() => refs[idx].current?.click()}
                style={{ width:44, height:44, border:`1px dashed ${C.border2}`, borderRadius:6,
                  background:'transparent', cursor:'pointer', color:C.creamFaint, fontSize:18, display:'flex',
                  alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>
                {uploading[idx] ? '↑' : '+'}
              </button>
              <input ref={refs[idx]} type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => handleFile(e, idx)} />
            </>
          )}
        </div>
      ))}
      {urls.length > 0 && (
        <div style={{ width:'100%', fontSize:9, color:C.creamFaint, marginTop:2 }}>
          {urls.length}/{MAX_IMGS} fotos
        </div>
      )}
    </div>
  )
}

// ── Editor de 3 botones interactivos para una respuesta rápida ──
function BotonesEditor({ botones, onChange }) {
  const set = (i, v) => onChange([0, 1, 2].map(j => j === i ? v : (botones[j] || '')))
  return (
    <div style={{ marginTop:6 }}>
      <p style={{ fontSize:9, color:'#f59e0b', margin:'0 0 3px', fontWeight:600 }}>🔘 Botones (opcional · máx 3 · 20 car.)</p>
      {[0, 1, 2].map(i => (
        <input key={i} value={botones[i] || ''} onChange={e => set(i, e.target.value)} maxLength={20}
          placeholder={`Botón ${i + 1}`}
          style={{ width:'100%', marginBottom:4, background:'#111c2a', border:'1px solid #1e2d3d', borderRadius:6, padding:'5px 8px', color:'#e2e8f0', fontSize:11, outline:'none', fontFamily:'inherit' }}
          onFocus={e => e.target.style.borderColor = '#f59e0b'} onBlur={e => e.target.style.borderColor = '#1e2d3d'} />
      ))}
    </div>
  )
}

// ── Tarjeta de producto del catálogo (pestaña TIENDA) ────────────
function ProductCard({ p, sending, windowOpen, onSendFoto, onSendInfo }) {
  const btnOn  = { background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.25)`, color:C.cream }
  const btnOff = { background:'transparent', border:`1px solid ${C.border}`, color:C.creamFaint }
  return (
    <div style={{ background:`rgba(244,241,236,.02)`, border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative', width:'100%', aspectRatio:'1 / 1', background:C.bg }}>
        <img src={p.image} alt={p.title} loading="lazy"
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
          onError={e => { e.currentTarget.style.opacity = 0 }} />
        <span style={{ position:'absolute', top:5, right:5, background:'rgba(10,10,10,.85)', color:C.cream, fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:6, border:`1px solid ${C.border2}` }}>
          ${p.price}
        </span>
      </div>
      <div style={{ padding:'6px 7px', display:'flex', flexDirection:'column', gap:4, flex:1 }}>
        <span style={{ fontSize:11, color:C.creamDim, fontWeight:600, lineHeight:1.25, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', minHeight:28 }}>
          {p.title}
        </span>
        {p.variants?.length > 0 && (
          <span style={{ fontSize:9, color:C.creamFaint }}>{p.variants.length} variante{p.variants.length === 1 ? '' : 's'}</span>
        )}
        <div style={{ display:'flex', gap:3, marginTop:'auto' }}>
          <button onClick={() => onSendFoto(p)} disabled={sending || !windowOpen}
            title={windowOpen ? 'Enviar solo la foto' : 'Ventana cerrada'}
            style={{ flex:1, padding:'5px', borderRadius:6, fontSize:10, fontWeight:700, fontFamily:'inherit',
              cursor: windowOpen && !sending ? 'pointer' : 'default', ...(windowOpen ? btnOn : btnOff) }}>
            {sending === 'foto' ? '⏳' : '📤 Foto'}
          </button>
          <button onClick={() => onSendInfo(p)} disabled={sending || !windowOpen}
            title={windowOpen ? 'Enviar foto + título y precio' : 'Ventana cerrada'}
            style={{ padding:'5px 8px', borderRadius:6, fontSize:10, fontWeight:700, fontFamily:'inherit',
              cursor: windowOpen && !sending ? 'pointer' : 'default', ...btnOff, color: windowOpen ? C.creamDim : C.creamFaint }}>
            {sending === 'info' ? '⏳' : 'ℹ️'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'respuestas', icon: '⚡', label: 'Respuestas' },
  { id: 'ventas',     icon: '📦', label: 'Ventas' },
  { id: 'tienda',     icon: '🛍️', label: 'Tienda' },
]

export default function RightPanel({ activeConv, onQuickReply, onSendText, onSendImage, contactInfo, onUpdateContact, windowOpen }) {
  const [tab, setTab] = useState('respuestas')
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!activeConv) return
    const lastIncoming = [...activeConv.msgs].reverse().find(m => m.direccion === 'ENTRANTE')
    if (!lastIncoming) return
    const tick = () => {
      const diff = parseDate(lastIncoming.timestamp).getTime() + 24*60*60*1000 - Date.now()
      if (diff <= 0) { setCountdown('00:00:00'); return }
      const h = Math.floor(diff/3600000)
      const m = Math.floor((diff%3600000)/60000)
      const s = Math.floor((diff%60000)/1000)
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [activeConv])

  const [replies,       setReplies]       = useState([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [editingIdx,    setEditingIdx]    = useState(null)
  const [editText,      setEditText]      = useState('')
  const [editImgUrls,   setEditImgUrls]   = useState([])
  const [newText,       setNewText]       = useState('')
  const [newImgUrls,    setNewImgUrls]    = useState([])
  const [editBotones,   setEditBotones]   = useState(['', '', ''])
  const [newBotones,    setNewBotones]    = useState(['', '', ''])
  const [sending,       setSending]       = useState(null)
  const [editAlias,     setEditAlias]     = useState(false)
  const [aliasInput,    setAliasInput]    = useState('')
  const [notasInput,    setNotasInput]    = useState('')
  const [notasSaving,   setNotasSaving]   = useState(false)
  const [notasSaved,    setNotasSaved]    = useState(false)
  const notasLoadedRef = useRef(null)

  // ── Crear pedido (botón que lee la conversación y crea el pedido en el CRM de IND) ──
  const [pedidoLoading, setPedidoLoading] = useState(false)
  const [pedidoRes,     setPedidoRes]     = useState(null)

  // ── Catálogo TIENDA (Shopify INDSTORE) ───────────────────────
  const [productos,       setProductos]       = useState(null)  // null = cargando
  const [productosLoaded, setProductosLoaded] = useState(false)
  const [prodQuery,       setProdQuery]       = useState('')
  const [prodSending,     setProdSending]     = useState(null)  // { id, modo }

  useEffect(() => {
    if (repliesLoaded) return
    fetchRepliesFromSheet().then(data => { setReplies(data || []); setRepliesLoaded(true) })
  }, [repliesLoaded])

  useEffect(() => {
    if (!activeConv) return
    if (notasLoadedRef.current !== activeConv.telefono) {
      notasLoadedRef.current = activeConv.telefono
      setNotasInput(contactInfo?.notas || '')
      setNotasSaved(false)
      setPedidoRes(null)
    }
  }, [activeConv, contactInfo])

  // Cargar el catálogo la PRIMERA vez que se abre la pestaña Tienda (perezoso)
  useEffect(() => {
    if (tab !== 'tienda' || productosLoaded) return
    let cancel = false
    setProductos(null)
    fetchProductos().then(list => {
      if (!cancel) { setProductos(list || []); setProductosLoaded(true) }
    })
    return () => { cancel = true }
  }, [tab, productosLoaded])

  if (!activeConv) return null

  const startEdit = (idx) => {
    setEditingIdx(idx)
    setEditText(replies[idx].text)
    setEditImgUrls(getImgUrls(replies[idx]))
    const b = replies[idx].botones || []
    setEditBotones([b[0] || '', b[1] || '', b[2] || ''])
  }
  const clearEdit = () => { setEditingIdx(null); setEditText(''); setEditImgUrls([]); setEditBotones(['', '', '']) }
  const saveEdit = async () => {
    if (!editText.trim()) return
    const botones = editBotones.map(s => s.trim()).filter(Boolean).slice(0, 3)
    const updated = { ...replies[editingIdx], text: editText.trim(), ...urlsToReply(editImgUrls), botones }
    setReplies(prev => prev.map((r,i) => i===editingIdx ? updated : r))
    clearEdit()
    await writeReply('actualizar', updated)
  }
  const deleteReply = async (idx) => {
    const r = replies[idx]; setReplies(prev => prev.filter((_,i) => i!==idx))
    await writeReply('eliminar', r)
  }
  const addReply = async () => {
    if (!newText.trim()) return
    const botones = newBotones.map(s => s.trim()).filter(Boolean).slice(0, 3)
    const nr = { id: crypto.randomUUID(), text: newText.trim(), ...urlsToReply(newImgUrls), botones }
    setReplies(prev => [...prev, nr])
    setNewText(''); setNewImgUrls([]); setNewBotones(['', '', ''])
    await writeReply('agregar', nr)
  }

  const handleSendQuick = async (idx) => { setSending(idx); await onQuickReply(replies[idx]); setSending(null) }

  // ── TIENDA: enviar producto ──────────────────────────────────
  const productosFiltrados = (productos || []).filter(p =>
    !prodQuery.trim() || String(p.title).toLowerCase().includes(prodQuery.trim().toLowerCase())
  )
  const sendProductoFoto = async (p) => {
    if (!windowOpen || prodSending) return
    setProdSending({ id: p.id, modo: 'foto' })
    try { await onSendImage?.(p.image) }
    finally { setTimeout(() => setProdSending(null), 600) }
  }
  const sendProductoInfo = async (p) => {
    if (!windowOpen || prodSending) return
    setProdSending({ id: p.id, modo: 'info' })
    try {
      await onSendText?.(`${p.title}${p.price ? ` — $${p.price}` : ''}`)
      await onSendImage?.(p.image)
    } finally { setTimeout(() => setProdSending(null), 600) }
  }

  const crearPedido = async () => {
    if (pedidoLoading || !activeConv) return
    // Armamos el transcript desde la conversación que el inbox ya tiene en memoria
    const msgs = (activeConv.msgs || []).filter(m => String(m.mensaje || '').trim())
    const transcript = msgs.map(m => `${m.direccion === 'SALIENTE' ? 'VENDEDOR' : 'CLIENTE'}: ${m.mensaje}`).join('\n')
    if (!transcript) { setPedidoRes({ ok: false, error: 'La conversación está vacía' }); return }
    setPedidoLoading(true); setPedidoRes(null)
    try {
      const r = await fetch(CFG.AGENT_CREAR_PEDIDO_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeConv.telefono, transcript }),
      })
      const res = await r.json()
      setPedidoRes(res)
      if (res?.ok && res.pedidoId) {
        // Persiste el pedido en NOTAS y marca idVenta → queda en 💰 Ventas y no se pierde el link
        const linea = `📦 Pedido ${res.pedidoId} · $${res.montoTotal}\n${res.url || ''}`.trim()
        const base = String(notasInput || '')
        const nueva = base.includes(res.pedidoId) ? base : (base.trim() ? `${base.trim()}\n${linea}` : linea)
        setNotasInput(nueva)
        saveNotes(activeConv.telefono, contactInfo?.nombre || activeConv.nombre, nueva).catch(() => {})
        setIdVenta(activeConv.telefono, res.pedidoId).catch(() => {})
      }
    } catch {
      setPedidoRes({ ok: false, error: 'No se pudo conectar con el agente IND' })
    } finally { setPedidoLoading(false) }
  }

  const handleSaveNotas = async () => {
    if(notasSaving) return; setNotasSaving(true)
    try { await saveNotes(activeConv.telefono, contactInfo?.nombre||activeConv.nombre, notasInput); setNotasSaved(true); setTimeout(()=>setNotasSaved(false),2500) }
    finally { setNotasSaving(false) }
  }

  const contactName = contactInfo?.alias||contactInfo?.nombre||activeConv.nombre
  const btnBase  = { fontFamily:'inherit', cursor:'pointer', transition:'all .15s' }
  const inputBase = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:7, color:C.cream, fontSize:12, padding:'6px 9px', outline:'none', fontFamily:'inherit' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.surface, overflow:'hidden' }}>

      {/* ── HEADER FIJO: INFO CONTACTO + VENTANA ── */}
      <div style={{ flexShrink:0, padding:'14px 14px 10px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:8 }}>
          <Avatar name={contactName} phone={activeConv.telefono} size={38} />
          <div style={{ flex:1, minWidth:0 }}>
            {editAlias ? (
              <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                <input value={aliasInput} onChange={e=>setAliasInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){onUpdateContact?.({alias:aliasInput.trim()});setEditAlias(false)} if(e.key==='Escape')setEditAlias(false) }}
                  autoFocus style={{ ...inputBase, flex:1, fontSize:12, padding:'3px 7px', borderColor:C.cream }} />
                <button onClick={()=>{onUpdateContact?.({alias:aliasInput.trim()});setEditAlias(false)}}
                  style={{ ...btnBase, background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.25)`, color:C.cream, borderRadius:5, padding:'3px 7px', fontSize:10 }}>✓</button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontWeight:700, color:C.cream, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{contactName}</span>
                <button onClick={()=>{setAliasInput(contactInfo?.alias||'');setEditAlias(true)}}
                  style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:10, padding:0, flexShrink:0 }}>✏️</button>
              </div>
            )}
            <div style={{ fontSize:10, color:C.creamFaint, marginTop:1 }}>+{activeConv.telefono}</div>
          </div>
        </div>
        <div style={{ marginTop:7, padding:'5px 10px', background:windowOpen?`rgba(244,241,236,.05)`:'rgba(245,158,11,.06)', border:`1px solid ${windowOpen?'rgba(244,241,236,.15)':'rgba(245,158,11,.2)'}`, borderRadius:7, fontSize:11, color:windowOpen?C.cream:'#f59e0b', fontWeight:700, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{windowOpen?'✅ Ventana activa':'⚠️ Ventana cerrada'}</span>
          {countdown&&windowOpen&&<span style={{ fontFamily:'monospace', fontSize:12, fontWeight:800, color:parseInt(countdown.split(':')[0])===0&&parseInt(countdown.split(':')[1])<30?'#f87171':C.cream }}>⏱ {countdown}</span>}
          {!windowOpen&&<span style={{ fontFamily:'monospace', fontSize:11, color:C.creamFaint }}>Expirada</span>}
        </div>
      </div>

      {/* ── BARRA DE PESTAÑAS ── */}
      <div style={{ flexShrink:0, display:'flex', background:C.bg, borderBottom:`1px solid ${C.border}` }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex:1, padding:'10px 4px 8px', background: active ? 'rgba(244,241,236,.05)' : 'transparent',
                border:'none', borderBottom: active ? `2px solid ${C.cream}` : '2px solid transparent',
                color: active ? C.cream : C.creamFaint, fontSize:11, fontWeight:800, cursor:'pointer',
                fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                transition:'all .15s', letterSpacing:'.02em',
              }}>
              <span style={{ fontSize:15 }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── CONTENIDO DE LA PESTAÑA ACTIVA (scroll propio) ── */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>

        {/* ═══════════ RESPUESTAS RÁPIDAS ═══════════ */}
        {tab === 'respuestas' && (
          <>
            <div style={{ padding:'10px 12px 6px' }}>
              <p style={{ fontSize:10, color:C.creamFaint, fontWeight:700, letterSpacing:'.08em', display:'flex', alignItems:'center', gap:5, margin:0 }}>
                ⚡ RESPUESTAS RÁPIDAS
                {!repliesLoaded&&<span style={{ fontSize:9, color:C.creamFaint }}>cargando...</span>}
                {repliesLoaded&&<span style={{ fontSize:8, background:`rgba(244,241,236,.06)`, color:C.creamDim, borderRadius:10, padding:'1px 5px' }}>{replies.length}</span>}
                <span onClick={() => setRepliesLoaded(false)} title="Recargar" style={{ marginLeft:'auto', color:C.creamFaint, fontSize:12, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>🔄</span>
              </p>
            </div>

            <div style={{ padding:'0 12px', display:'flex', flexDirection:'column', gap:5 }}>
              {replies.map((reply, idx) => {
                const imgs = getImgUrls(reply)
                return (
                  <div key={reply.id||idx}>
                    {editingIdx===idx ? (
                      <div style={{ background:`rgba(244,241,236,.03)`, border:`1px solid ${C.cream}`, borderRadius:9, padding:'8px', marginBottom:2 }}>
                        <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={4} placeholder="Texto..."
                          style={{ width:'100%', ...inputBase, border:`1px solid ${C.cream}`, resize:'vertical', marginBottom:5, whiteSpace:'pre-wrap', minHeight:80 }} />
                        <p style={{ fontSize:9, color:C.creamFaint, marginBottom:3 }}>Fotos ({editImgUrls.length}/{MAX_IMGS})</p>
                        <MultiImgEditor urls={editImgUrls} onChange={setEditImgUrls} />
                        <BotonesEditor botones={editBotones} onChange={setEditBotones} />
                        <div style={{ display:'flex', gap:3, marginTop:7 }}>
                          <button onClick={saveEdit} style={{ ...btnBase, flex:1, padding:'5px', background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.25)`, color:C.cream, borderRadius:6, fontSize:10 }}>✓ Guardar</button>
                          <button onClick={clearEdit} style={{ ...btnBase, flex:1, padding:'5px', background:'transparent', border:`1px solid ${C.border}`, color:C.creamDim, borderRadius:6, fontSize:10 }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background:`rgba(244,241,236,.02)`, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}
                        onMouseEnter={e=>e.currentTarget.style.background=`rgba(244,241,236,.04)`}
                        onMouseLeave={e=>e.currentTarget.style.background=`rgba(244,241,236,.02)`}>
                        {/* Mini strip de fotos */}
                        {imgs.length>0&&(
                          <div style={{ display:'flex', gap:1, height:36 }}>
                            {imgs.map((u,i)=>(
                              <img key={i} src={u} style={{ flex:1, objectFit:'cover', display:'block', maxWidth: `${100/imgs.length}%` }} alt=""
                                onError={e=>e.currentTarget.style.display='none'} />
                            ))}
                          </div>
                        )}
                        <div style={{ padding:'5px 7px', display:'flex', alignItems:'flex-start', gap:3 }}>
                          <span style={{ flex:1, fontSize:11, color:C.creamDim, lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                            {imgs.length>0&&`🖼×${imgs.length} `}{reply.botones?.length>0&&<span style={{ color:'#f59e0b', fontWeight:700 }}>{`🔘×${reply.botones.length} `}</span>}{reply.text}
                          </span>
                          <div style={{ display:'flex', gap:2, flexShrink:0 }}>
                            <button onClick={()=>handleSendQuick(idx)} disabled={sending===idx||!windowOpen}
                              style={{ ...btnBase, background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.2)`, color:C.cream, borderRadius:5, width:20, height:20, cursor:'pointer', fontSize:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {sending===idx?'⏳':'➤'}
                            </button>
                            <button onClick={()=>startEdit(idx)} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:10, padding:'0 2px' }}>✏️</button>
                            <button onClick={()=>deleteReply(idx)} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:10, padding:'0 2px' }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Nueva respuesta */}
            <div style={{ margin:'8px 12px 14px', background:`rgba(244,241,236,.02)`, border:`1px dashed ${C.border2}`, borderRadius:8, padding:'8px' }}>
              <p style={{ fontSize:9, color:C.creamFaint, fontWeight:700, letterSpacing:'.06em', marginBottom:5 }}>+ NUEVA</p>
              <textarea value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Texto..." rows={2}
                style={{ width:'100%', ...inputBase, fontSize:11, padding:'5px 7px', resize:'none', marginBottom:5, whiteSpace:'pre-wrap' }}
                onFocus={e=>e.target.style.borderColor=C.cream} onBlur={e=>e.target.style.borderColor=C.border} />
              <p style={{ fontSize:9, color:C.creamFaint, marginBottom:3 }}>Fotos ({newImgUrls.length}/{MAX_IMGS})</p>
              <MultiImgEditor urls={newImgUrls} onChange={setNewImgUrls} />
              <BotonesEditor botones={newBotones} onChange={setNewBotones} />
              <button onClick={addReply} disabled={!newText.trim()}
                style={{ ...btnBase, width:'100%', marginTop:7, padding:'6px', background:newText.trim()?`rgba(244,241,236,.1)`:'transparent', border:`1px solid ${newText.trim()?'rgba(244,241,236,.25)':C.border}`, color:newText.trim()?C.cream:C.creamFaint, borderRadius:7, fontSize:11, fontWeight:600, cursor:newText.trim()?'pointer':'default' }}>
                + Agregar
              </button>
            </div>
          </>
        )}

        {/* ═══════════ VENTAS: CREAR PEDIDO + NOTAS ═══════════ */}
        {tab === 'ventas' && (
          <>
            {/* CREAR PEDIDO */}
            <div style={{ padding:'12px 12px 4px' }}>
              <button onClick={crearPedido} disabled={pedidoLoading}
                style={{ ...btnBase, width:'100%', padding:'9px', background: pedidoLoading?C.surface2:'linear-gradient(135deg,#10b981,#059669)', border:'1px solid rgba(16,185,129,.4)', color:'#fff', borderRadius:8, fontSize:12, fontWeight:800, cursor: pedidoLoading?'default':'pointer', letterSpacing:'.03em' }}>
                {pedidoLoading ? '⏳ Leyendo conversación y creando…' : '🧾 CREAR PEDIDO'}
              </button>

              {pedidoRes?.ok && (
                <div style={{ marginTop:8, padding:'9px 10px', background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#10b981' }}>✅ Pedido creado: {pedidoRes.pedidoId}</div>
                  <div style={{ fontSize:11, color:C.creamDim, marginTop:2 }}>Total ${pedidoRes.montoTotal} · {pedidoRes.diasCalculado} días</div>
                  {pedidoRes.url && <a href={pedidoRes.url} target="_blank" rel="noreferrer" style={{ display:'inline-block', marginTop:6, padding:'5px 10px', background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.35)', color:'#10b981', borderRadius:6, fontSize:11, fontWeight:700, textDecoration:'none' }}>📄 Ver pedido</a>}
                </div>
              )}

              {pedidoRes && !pedidoRes.ok && pedidoRes.faltan && (
                <div style={{ marginTop:8, padding:'9px 10px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)', borderRadius:8 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'#f59e0b' }}>⚠️ Faltan datos: {pedidoRes.faltan.join(', ')}</div>
                  <textarea readOnly value={pedidoRes.sugerencia || ''} rows={3}
                    style={{ width:'100%', marginTop:6, ...inputBase, fontSize:11, resize:'vertical', whiteSpace:'pre-wrap' }} />
                  <div style={{ display:'flex', gap:5, marginTop:5 }}>
                    <button onClick={() => onSendText && onSendText(pedidoRes.sugerencia)} disabled={!windowOpen}
                      style={{ ...btnBase, flex:1, padding:'6px', background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.25)`, color:C.cream, borderRadius:6, fontSize:11, fontWeight:700 }}>📤 Enviar al cliente</button>
                    <button onClick={() => onSendText && onSendText(null, pedidoRes.sugerencia)}
                      style={{ ...btnBase, flex:1, padding:'6px', background:`rgba(244,241,236,.04)`, border:`1px solid ${C.border}`, color:C.creamDim, borderRadius:6, fontSize:11 }}>✏️ Editar</button>
                  </div>
                </div>
              )}

              {pedidoRes && !pedidoRes.ok && !pedidoRes.faltan && (
                <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.3)', borderRadius:8, fontSize:11, color:'#f87171' }}>
                  ❌ {pedidoRes.error || 'No se pudo crear el pedido'}
                </div>
              )}
            </div>

            {/* NOTAS */}
            <div style={{ padding:'10px 12px', borderTop:`1px solid ${C.border}`, marginTop:8, background:C.bg }}>
              <p style={{ fontSize:10, color:'#f59e0b', fontWeight:700, letterSpacing:'.08em', marginBottom:6, display:'flex', alignItems:'center', gap:5 }}>
                📝 NOTAS
                {notasSaved&&<span style={{ fontSize:8, background:`rgba(244,241,236,.1)`, color:C.cream, borderRadius:10, padding:'1px 6px' }}>Guardado ✓</span>}
              </p>
              {(() => { const u = (String(notasInput || '').match(/https?:\/\/\S+\/dashboard\/pedido\/\S+/) || [])[0]; return u ? (
                <a href={u} target="_blank" rel="noreferrer" style={{ display:'inline-block', marginBottom:6, padding:'4px 9px', background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.35)', color:'#10b981', borderRadius:6, fontSize:11, fontWeight:700, textDecoration:'none' }}>📄 Ver pedido</a>
              ) : null })()}
              <textarea value={notasInput} onChange={e=>{setNotasInput(e.target.value);setNotasSaved(false)}} placeholder="Ej: Falta que envíe la foto del pago..." rows={3}
                style={{ width:'100%', ...inputBase, resize:'vertical', fontSize:11, minHeight:56, whiteSpace:'pre-wrap' }}
                onFocus={e=>e.target.style.borderColor='#f59e0b'} onBlur={e=>e.target.style.borderColor=C.border} />
              <button onClick={handleSaveNotas} disabled={notasSaving}
                style={{ ...btnBase, width:'100%', marginTop:5, padding:'6px', background:notasSaving?C.bg:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.3)', color:'#f59e0b', borderRadius:7, fontSize:11, fontWeight:700, cursor:notasSaving?'default':'pointer' }}>
                {notasSaving?'⏳ Guardando...':'💾 Guardar nota'}
              </button>
            </div>
          </>
        )}

        {/* ═══════════ TIENDA: CATÁLOGO SHOPIFY (INDSTORE) ═══════════ */}
        {tab === 'tienda' && (
          <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
            {/* Buscador */}
            <div style={{ position:'sticky', top:0, zIndex:2, padding:'10px 12px', background:C.surface, borderBottom:`1px solid ${C.border}` }}>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:C.creamFaint }}>🔍</span>
                <input value={prodQuery} onChange={e => setProdQuery(e.target.value)} placeholder="Buscar producto…"
                  style={{ width:'100%', ...inputBase, fontSize:12, padding:'7px 28px' }}
                  onFocus={e => e.target.style.borderColor=C.cream} onBlur={e => e.target.style.borderColor=C.border} />
                {prodQuery && (
                  <button onClick={() => setProdQuery('')} style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', color:C.creamFaint, fontSize:12, cursor:'pointer', padding:'2px 4px' }}>✕</button>
                )}
              </div>
              {productos !== null && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5 }}>
                  <span style={{ fontSize:9, color:C.creamFaint }}>{productosFiltrados.length} producto{productosFiltrados.length === 1 ? '' : 's'}</span>
                  <span onClick={() => setProductosLoaded(false)} title="Recargar catálogo" style={{ marginLeft:'auto', color:C.creamFaint, fontSize:12, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>🔄</span>
                </div>
              )}
            </div>

            {/* Contenido */}
            {productos === null ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'10px 12px' }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ borderRadius:9, overflow:'hidden', border:`1px solid ${C.border}` }}>
                    <div style={{ width:'100%', aspectRatio:'1 / 1', background:C.bg, opacity:.6, animation:'pulse 1.2s infinite' }} />
                    <div style={{ height:34, background:C.surface2 }} />
                  </div>
                ))}
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div style={{ fontSize:12, color:C.creamDim, textAlign:'center', padding:'26px 16px' }}>
                {prodQuery ? `Sin resultados para “${prodQuery}”` : 'No hay productos en el catálogo'}
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'10px 12px 16px' }}>
                {productosFiltrados.map(p => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    windowOpen={windowOpen}
                    sending={prodSending?.id === p.id ? prodSending.modo : null}
                    onSendFoto={sendProductoFoto}
                    onSendInfo={sendProductoInfo}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
