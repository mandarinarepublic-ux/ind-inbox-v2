'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { fetchRows, fetchContacts, sendReply, sendImageUrl as sendImageUrlApi, updateContact, isDemo, sendInteractiveButtons, toggleIAMode, sendVideo } from '@/lib/api-client'
import { buildConvs, fmtDate, parseDate as _parseDate } from '@/lib/utils'
import { Spinner, Avatar, ContactRow, MessageBubble, Toast } from '@/components/Components'
import RightPanel from '@/components/RightPanel'
import { actualizarNoLeidos } from '@/lib/notif'

// Paleta IND
const C = {
  bg:        '#0A0A0A',
  surface:   '#0D0D0D',
  surface2:  '#111111',
  border:    '#1F1F1F',
  border2:   '#2A2A2A',
  cream:     '#F4F1EC',
  creamDim:  '#A09A90',
  creamFaint:'#3A3530',
}

const IMGBB_KEY    = '2307574d43689522feabd27cff3443df'

async function toJpeg(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(new File([blob], 'imagen.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
    }
    img.src = url
  })
}

// ── EMOJI PICKER ──────────────────────────────────────────────────
const EMOJI_CATS = [
  { label:'😊', title:'Expresiones', emojis:['😊','😄','😂','🤣','😍','🥰','😘','😎','🤩','😜','😅','😭','😢','😡','🤔','🙏','👍','👎','❤️','🔥','💯','✅','⭐','🎉','🎊','💪','👏','🙌','💰','💸','🤝','😏','🫶','😋','🤑'] },
  { label:'👕', title:'Ropa',        emojis:['👕','👔','🧥','🧣','🧤','👗','👖','👟','👠','👜','🛍️','📦','🚚','💳','🏷️','📸','✂️','🎨','🖼️','📐','🧵','🪡','👒','🎒','💎','🪄','🎭','🎪'] },
  { label:'✍️', title:'Negocio',     emojis:['✍️','📝','📋','📌','📍','🔍','🔎','💡','⚡','🌟','💫','✨','🎯','📊','📈','📉','🗓️','⏰','🔔','📣','📲','💬','🗣️','📞','📧','🤖','🏆','🥇','💼','🔐'] },
  { label:'🌎', title:'Lugares',     emojis:['🌎','🇪🇨','🏠','🏪','📍','🗺️','✈️','🚗','🛵','🚴','🌤️','☀️','🌙','🌈','🌊','🌺','🌸','🍀','🎋','🏔️','🌴','🏖️','🌆','🏡','🛒'] },
]

function EmojiPicker({ onSelect, onClose }) {
  const [cat,    setCat]    = useState(0)
  const [search, setSearch] = useState('')
  const allEmojis = EMOJI_CATS.flatMap(c => c.emojis)
  const displayed = search.trim() ? allEmojis.filter(e => e.includes(search)) : EMOJI_CATS[cat].emojis
  return (
    <div style={{ position:'absolute', bottom:'100%', left:0, right:0, marginBottom:8, background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:14, zIndex:60, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.8)' }}>
      <div style={{ padding:'8px 10px 6px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:6, alignItems:'center' }}>
        <span style={{ fontSize:13, color:C.creamFaint }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar emoji..." autoFocus
          style={{ flex:1, background:'transparent', border:'none', outline:'none', color:C.cream, fontSize:12, fontFamily:'Outfit,sans-serif' }} />
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:15, padding:0, lineHeight:1 }}>✕</button>
      </div>
      {!search.trim() && (
        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}` }}>
          {EMOJI_CATS.map((c,i) => (
            <button key={i} onClick={() => setCat(i)} title={c.title}
              style={{ flex:1, padding:'7px 0', background: cat===i ? `rgba(244,241,236,.06)` : 'transparent', border:'none', borderBottom: cat===i ? `2px solid ${C.cream}` : '2px solid transparent', cursor:'pointer', fontSize:18, transition:'all .15s' }}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(9,1fr)', gap:1, padding:'8px', maxHeight:190, overflowY:'auto' }}>
        {displayed.map((emoji, i) => (
          <button key={i} onClick={() => onSelect(emoji)}
            style={{ background:'transparent', border:'none', borderRadius:7, cursor:'pointer', fontSize:22, padding:'5px 2px', lineHeight:1 }}
            onMouseEnter={e => e.currentTarget.style.background=`rgba(244,241,236,.08)`}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >{emoji}</button>
        ))}
        {displayed.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'20px 0', color:C.creamFaint, fontSize:12 }}>Sin resultados</div>}
      </div>
    </div>
  )
}

// Persistencia del "visto" por conversación → alimenta el badge de no leídos.
const SEEN_KEY  = 'ind_seen_v1'
const loadSeen  = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
const saveSeen  = (m) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)) } catch {} }

export default function App() {
  const [convs,        setConvs]        = useState([])
  const [contacts,     setContacts]     = useState({})
  const [active,       setActive]       = useState(null)
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [lastSync,     setLastSync]     = useState(null)
  const [search,       setSearch]       = useState('')
  const [searchMode,   setSearchMode]   = useState('contacto') // 'contacto' | 'mensaje'
  const [toast,        setToast]        = useState(null)
  const [showSidebar,  setShowSidebar]  = useState(true)
  const [showRight,    setShowRight]    = useState(false)
  const [imgFiles,     setImgFiles]     = useState([]) // array de { file, preview }
  const [imgUploading, setImgUploading] = useState(false)
  const [imgProgress,  setImgProgress]  = useState(0)  // cuántas enviadas
  const [imgResult,    setImgResult]    = useState(null)
  const [isVideo,      setIsVideo]      = useState(false)
  const [filter,       setFilter]       = useState('pendiente')
  const [showBtnPanel, setShowBtnPanel] = useState(false)
  const [btnTexts,     setBtnTexts]     = useState(['', '', ''])
  const [sendingBtns,  setSendingBtns]  = useState(false)
  const [showEmoji,    setShowEmoji]    = useState(false)
  const [togglingIA,   setTogglingIA]   = useState(false)
  const localIARef = useRef({})

  const endRef     = useRef(null)
  const pollRef    = useRef(null)
  const fileRef    = useRef(null)
  const msgsRef    = useRef(null)
  const autoScroll = useRef(true)
  const prevMsgLen = useRef(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const localStatusRef = useRef({})
  const pendingRef     = useRef({}) // mensajes optimistas por teléfono, hasta que Make los registre
  const seenRef        = useRef(null) // { telefono: epochMs } — última vez que se vio cada chat
  if (seenRef.current === null) seenRef.current = loadSeen()

  const load = useCallback(async () => {
    const [rows, ctList] = await Promise.all([fetchRows(), fetchContacts()])

    // rows === null → hubo ERROR (no "vacío"): conservar lo previo, no parpadear a blanco
    if (Array.isArray(rows)) {
      let next = buildConvs(rows, seenRef.current)
      // Re-inyectar mensajes optimistas que aún no están en la hoja
      const now = Date.now()
      const pend = pendingRef.current
      Object.keys(pend).forEach(tel => {
        const conv = next.find(c => c.telefono === tel)
        pend[tel] = (pend[tel] || []).filter(pm => {
          if (now - pm._pendingAt > 90000) return false // expira a los 90s
          // dropear cuando ya aparece un SALIENTE real con el mismo texto
          const yaEsta = conv?.msgs.some(m => m.direccion === 'SALIENTE' && !String(m.id).startsWith('tmp_') && String(m.mensaje).trim() === String(pm.mensaje).trim())
          return !yaEsta
        })
        if (pend[tel].length && conv) {
          next = next.map(c => c.telefono === tel
            ? { ...c, msgs: [...c.msgs, ...pend[tel]], last: pend[tel][pend[tel].length - 1] }
            : c)
        }
        if (!pend[tel].length) delete pend[tel]
      })
      setConvs(next)
    }

    if (Array.isArray(ctList)) {
      const ctMap = {}
      ctList.forEach(c => { ctMap[c.telefono] = c })
      const now = Date.now()
      Object.entries(localStatusRef.current).forEach(([tel, override]) => {
        if (override.expiresAt > now && ctMap[tel]) ctMap[tel] = { ...ctMap[tel], estado: override.estado }
      })
      setContacts(ctMap)
    }

    setLastSync(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 8000)
    return () => clearInterval(pollRef.current)
  }, [load])

  useEffect(() => {
    const activeConv = convs.find(c => c.telefono === active)
    if (!activeConv) return
    // Chat abierto = visto: mueve el marcador para que lo entrante no quede "no leído".
    if (document.visibilityState === 'visible') { seenRef.current[active] = Date.now(); saveSeen(seenRef.current) }
    const newLen = activeConv.msgs.length
    const hadNewMsg = newLen > prevMsgLen.current
    prevMsgLen.current = newLen
    if (autoScroll.current || hadNewMsg) endRef.current?.scrollIntoView({ behavior: hadNewMsg ? 'smooth' : 'instant' })
  }, [active, convs])

  const handleMsgsScroll = () => {
    const el = msgsRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const vistosRef         = useRef(null)
  const totalEntrantesRef = useRef(0)

  useEffect(() => {
    const total = convs.reduce((s, c) => s + (c.msgs?.filter(m => m.direccion === 'ENTRANTE').length || 0), 0)
    totalEntrantesRef.current = total
    if (vistosRef.current === null) vistosRef.current = total
    if (document.visibilityState === 'visible') { vistosRef.current = total; actualizarNoLeidos(0) }
    else actualizarNoLeidos(Math.max(0, total - vistosRef.current))
  }, [convs])

  useEffect(() => {
    const alVolver = () => { vistosRef.current = totalEntrantesRef.current; actualizarNoLeidos(0) }
    const onVis = () => { if (document.visibilityState === 'visible') alVolver() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', alVolver)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', alVolver) }
  }, [])

  const openConv = (telefono) => {
    setActive(telefono); setShowSidebar(false); autoScroll.current = true; prevMsgLen.current = 0
    seenRef.current[telefono] = Date.now(); saveSeen(seenRef.current)
    setConvs(prev => prev.map(c => c.telefono === telefono ? { ...c, unread: 0 } : c))
  }

  const activeConv     = convs.find(c => c.telefono === active) || null
  const totalUnread    = convs.reduce((s, c) => s + c.unread, 0)
  // VENTA desacoplada del estado de flujo:
  // - getStatus = SOLO el estado real (pendiente/atendido/…), NO se fuerza 'venta'.
  // - "Venta" = tiene un PEDIDO CREADO (idVenta, col H). La pestaña 💰 filtra por eso
  //   y excluye archivados. Así un cliente con venta que vuelve a escribir aparece en
  //   Pendiente Y en Ventas (conviven); al archivar, sale de Ventas.
  const hasVenta      = (tel) => String(contacts[tel]?.idVenta || '').trim() !== ''
  const getStatus     = (tel) => contacts[tel]?.estado || 'pendiente'
  const esVentaActiva = (tel) => hasVenta(tel) && getStatus(tel) !== 'archivado'

  // Búsqueda tolerante de teléfono (Ecuador): 0987… == 593987… (últimos 9 díg).
  const soloDig  = (s) => String(s || '').replace(/\D/g, '')
  const telLocal = (s) => soloDig(s).replace(/^593/, '').replace(/^0+/, '')
  const phoneMatch = (telefono, query) => {
    const p = soloDig(telefono), qy = soloDig(query)
    if (!qy) return false
    if (p.includes(qy)) return true
    const pl = telLocal(p), ql = telLocal(qy)
    return ql.length >= 7 && pl.endsWith(ql)
  }

  const q = search.trim().toLowerCase()
  const isSearching = q.length > 0
  const searchingMsgs = isSearching && searchMode === 'mensaje'

  // Fragmento del mensaje más reciente que contiene la búsqueda (modo Mensajes)
  const matchSnippet = (c) => {
    const m = [...(c.msgs || [])].reverse().find(m => (m.mensaje || '').toLowerCase().includes(q))
    if (!m) return ''
    const t = String(m.mensaje || '')
    const i = t.toLowerCase().indexOf(q)
    const start = Math.max(0, i - 28), end = i + q.length + 42
    return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '')
  }

  const searched = !isSearching ? convs
    : searchingMsgs
      ? convs.filter(c => (c.msgs || []).some(m => (m.mensaje || '').toLowerCase().includes(q)))
      : convs.filter(c => {
          const alias = (contacts[c.telefono]?.alias || '').toLowerCase()
          return c.nombre.toLowerCase().includes(q) || alias.includes(q) || phoneMatch(c.telefono, search)
        })
  // Al BUSCAR mostramos TODOS los resultados sin importar la pestaña activa.
  const filtered = isSearching
    ? searched
    : searched.filter(c => filter === 'venta' ? esVentaActiva(c.telefono) : getStatus(c.telefono) === filter)
  const counts = {
    pendiente:    searched.filter(c => getStatus(c.telefono) === 'pendiente').length,
    atendido:     searched.filter(c => getStatus(c.telefono) === 'atendido').length,
    archivado:    searched.filter(c => getStatus(c.telefono) === 'archivado').length,
    ventaproceso: searched.filter(c => getStatus(c.telefono) === 'ventaproceso').length,
    venta:        searched.filter(c => esVentaActiva(c.telefono)).length,
    soporte:      searched.filter(c => getStatus(c.telefono) === 'soporte').length,
  }

  const lastIncoming = activeConv ? [...activeConv.msgs].reverse().find(m => m.direccion === 'ENTRANTE') : null
  const windowOpen   = lastIncoming ? (Date.now() - _parseDate(lastIncoming.timestamp).getTime()) < 24 * 60 * 60 * 1000 : false

  const changingRef = useRef({})
  const changeStatus = async (telefono, status) => {
    const estadoActual = contacts[telefono]?.estado || 'pendiente'
    if (estadoActual === status) return
    if (changingRef.current[telefono]) return
    changingRef.current[telefono] = true
    setTimeout(() => { delete changingRef.current[telefono] }, 3000)
    localStatusRef.current[telefono] = { estado: status, expiresAt: Date.now() + 15000 }
    setContacts(prev => ({ ...prev, [telefono]: { ...(prev[telefono] || {}), estado: status } }))
    const conv = convs.find(c => c.telefono === telefono)
    await updateContact(telefono, conv?.nombre || '', status, contacts[telefono]?.alias || '', true)
  }

  const handleUpdateContact = async ({ alias }) => {
    if (!activeConv) return
    const tel = activeConv.telefono
    const currentStatus = contacts[tel]?.estado || 'pendiente'
    setContacts(prev => ({ ...prev, [tel]: { ...(prev[tel] || {}), alias } }))
    await updateContact(tel, activeConv.nombre, currentStatus, alias)
  }

  const handleSend = (text) => {
    const t = (text || input).trim()
    if (!t || !activeConv) return
    const tel = activeConv.telefono, nombre = activeConv.nombre
    setInput(''); setToast(null); autoScroll.current = true
    // 1) Render optimista INSTANTÁNEO — el mensaje aparece ya, sin esperar al servidor.
    const tmpMsg = { id: 'tmp_' + Date.now(), telefono: tel, nombre, mensaje: t, direccion: 'SALIENTE', timestamp: new Date().toISOString(), estado: 'enviado', _pendingAt: Date.now() }
    setConvs(prev => prev.map(c => c.telefono === tel ? { ...c, msgs: [...c.msgs, tmpMsg], last: tmpMsg } : c))
    pendingRef.current[tel] = [ ...(pendingRef.current[tel] || []), tmpMsg ]
    // 2) Estado → atendido (optimista, no bloquea la UI)
    changeStatus(tel, currentStatus === 'ventaproceso' ? 'ventaproceso' : 'atendido')
    // 3) Enviar en segundo plano; solo avisamos si FALLA (no congela el input ni el botón)
    sendReply(tel, nombre, t)
      .then(result => { if (result && result.ok === false) { setToast(result); setTimeout(() => setToast(null), 4000) } })
      .catch(() => {})
    setTimeout(load, 4000)
  }

  const handleSendText = async (text, copyToInput) => {
    if (copyToInput !== undefined) { setInput(copyToInput); return }
    await handleSend(text)
  }

  const handleKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }

  const sendImageUrl = async (imageUrl) => {
    const res = await sendImageUrlApi(activeConv.telefono, activeConv.nombre, imageUrl)
    return res.ok
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setImgResult(null)
    // Si hay video, solo se permite uno
    const isVid = files[0].type.startsWith('video/')
    setIsVideo(isVid)
    if (isVid) {
      setImgFiles([{ file: files[0], preview: URL.createObjectURL(files[0]) }])
    } else {
      const processed = await Promise.all(files.slice(0, 10).map(async f => ({
        file: await toJpeg(f),
        preview: await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(f) })
      })))
      setImgFiles(processed)
    }
  }

  const handleSendImage = async () => {
    if (!imgFiles.length || !activeConv) return
    setImgUploading(true); setImgResult(null); setImgProgress(0)
    try {
      let allOk = true
      if (isVideo) {
        const result = await sendVideo(activeConv.telefono, activeConv.nombre, imgFiles[0].file)
        allOk = result.ok
      } else {
        for (let i = 0; i < imgFiles.length; i++) {
          const fd = new FormData(); fd.append('image', imgFiles[i].file)
          const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:'POST', body:fd })
          const data = await res.json()
          if (!data.success) { allOk = false; continue }
          const ok = await sendImageUrlApi(activeConv.telefono, activeConv.nombre, data.data.url)
          if (!ok) allOk = false
          setImgProgress(i + 1)
          if (i < imgFiles.length - 1) await new Promise(r => setTimeout(r, 800))
        }
      }
      setImgResult({ ok: allOk })
      await changeStatus(activeConv.telefono, currentStatus === 'ventaproceso' ? 'ventaproceso' : 'atendido')
      setTimeout(() => { setImgFiles([]); setImgResult(null); setIsVideo(false); setImgProgress(0); if (fileRef.current) fileRef.current.value = '' }, 1500)
      setTimeout(load, 4000)
    } catch { setImgResult({ ok: false }) }
    finally  { setImgUploading(false) }
  }

  const cancelImage = () => {
    imgFiles.forEach(f => { if (isVideo) URL.revokeObjectURL(f.preview) })
    setImgFiles([]); setImgResult(null); setIsVideo(false); setImgProgress(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleQuickReply = async (reply) => {
    if (!activeConv) return
    const botones = (reply.botones || []).filter(Boolean).slice(0, 3)
    if (botones.length && reply.text) {
      // Respuesta rápida CON botones interactivos
      const validBtns = botones.map((t, i) => ({ id: `btn_${i + 1}`, title: t }))
      // El servidor guarda SOLO el cuerpo en `mensaje`; los botones van aparte en `botones`
      // (así el texto optimista coincide con lo guardado → la reconciliación descarta el
      // temporal sin duplicar, y la burbuja pinta los botones desde `botones`).
      const tmpMsg = { id: 'tmp_' + Date.now(), telefono: activeConv.telefono, nombre: activeConv.nombre, mensaje: reply.text, botones: validBtns, direccion: 'SALIENTE', timestamp: new Date().toISOString(), estado: 'enviado', _pendingAt: Date.now() }
      setConvs(prev => prev.map(c => c.telefono === activeConv.telefono ? { ...c, msgs: [...c.msgs, tmpMsg], last: tmpMsg } : c))
      pendingRef.current[activeConv.telefono] = [ ...(pendingRef.current[activeConv.telefono] || []), tmpMsg ]
      sendInteractiveButtons(activeConv.telefono, activeConv.nombre, reply.text, validBtns).catch(() => {})
    } else if (reply.text) {
      await handleSend(reply.text)
    }
    // Recoger hasta 10 imágenes
    const imgs = Array.from({length: 10}, (_, i) =>
      i === 0 ? reply.imageUrl : reply[`imageUrl${i+1}`]
    ).filter(Boolean)
    for (let i = 0; i < imgs.length; i++) {
      await sendImageUrlApi(activeConv.telefono, activeConv.nombre, imgs[i])
      if (i < imgs.length - 1) await new Promise(r => setTimeout(r, 800))
    }
    changeStatus(activeConv.telefono, currentStatus === 'ventaproceso' ? 'ventaproceso' : 'atendido')
  }

  const handleSendAIImage = async (imageUrl) => {
    if (!activeConv || !imageUrl) return
    const res = await sendImageUrlApi(activeConv.telefono, activeConv.nombre, imageUrl)
    if (res.ok) await changeStatus(activeConv.telefono, currentStatus === 'ventaproceso' ? 'ventaproceso' : 'atendido')
  }

  const getModoIA = (tel) => {
    const now = Date.now()
    const local = localIARef.current[tel]
    if (local && local.expiresAt > now) return local.modoIA
    return contacts[tel]?.modoIA !== false
  }

  const handleToggleIA = async () => {
    if (!activeConv || togglingIA) return
    const tel = activeConv.telefono
    const current = getModoIA(tel)
    const next = !current
    setTogglingIA(true)
    localIARef.current[tel] = { modoIA: next, expiresAt: Date.now() + 15000 }
    setContacts(prev => ({ ...prev, [tel]: { ...(prev[tel] || {}), modoIA: next } }))
    await toggleIAMode(tel, activeConv.nombre, currentStatus, contacts[tel]?.alias || '', next)
    setTogglingIA(false)
  }

  const handleSendButtons = async () => {
    if (!activeConv || !input.trim()) return
    const validBtns = btnTexts.map((t,i) => ({ id:`btn_${i+1}`, title:t.trim() })).filter(b=>b.title)
    if (validBtns.length === 0) return
    setSendingBtns(true)
    // mensaje = solo el cuerpo (igual a lo que guarda el servidor) + botones aparte → sin duplicado.
    const tmpMsg = { id:'tmp_'+Date.now(), telefono:activeConv.telefono, nombre:activeConv.nombre, mensaje:input.trim(), botones:validBtns, direccion:'SALIENTE', timestamp:new Date().toISOString(), estado:'enviado', _pendingAt: Date.now() }
    setConvs(prev=>prev.map(c=>c.telefono===activeConv.telefono?{...c,msgs:[...c.msgs,tmpMsg],last:tmpMsg}:c))
    pendingRef.current[activeConv.telefono] = [ ...(pendingRef.current[activeConv.telefono] || []), tmpMsg ]
    const result = await sendInteractiveButtons(activeConv.telefono, activeConv.nombre, input.trim(), validBtns)
    setSendingBtns(false); setToast(result); setTimeout(()=>setToast(null),4000)
    if (result.ok) { setInput(''); setBtnTexts(['','','']); setShowBtnPanel(false); await changeStatus(activeConv.telefono, currentStatus==='ventaproceso'?'ventaproceso':'atendido'); setTimeout(load,4000) }
  }

  const currentContact     = activeConv ? contacts[activeConv.telefono] : null
  const currentStatus      = currentContact?.estado || 'pendiente'
  const currentStatusView  = activeConv ? getStatus(activeConv.telefono) : 'pendiente'
  const displayName        = (tel) => contacts[tel]?.alias || convs.find(c=>c.telefono===tel)?.nombre || tel

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { height:100%; height:100dvh; }
        body { background:${C.bg}; font-family:'Outfit',sans-serif; overflow:hidden; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.border2}; border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background:${C.creamFaint}; }
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes up    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        @keyframes slideR { from{transform:translateX(100%)} to{transform:translateX(0)} }
        textarea,button,input { font-family:'Outfit',sans-serif; }
        .app-shell  { display:flex; height:100%; overflow:hidden; position:relative; }
        .sidebar    { width:300px; flex-shrink:0; background:${C.surface}; border-right:1px solid ${C.border}; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .chat-col   { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }
        .right-col  { width:260px; flex-shrink:0; background:${C.bg}; border-left:1px solid ${C.border}; display:flex; flex-direction:column; overflow-y:auto; }
        .msgs-scroll{ flex:1; overflow-y:auto; padding:16px 20px; }
        .input-bar  { flex-shrink:0; padding:10px 16px 14px; background:${C.surface}; border-top:1px solid ${C.border}; }
        .mob-ham    { display:none !important; }
        .hide-mobile{ display:inline !important; }
        .show-mobile{ display:none !important; }
        .overlay    { display:none; }
        @media (max-width:767px){
          .sidebar{ position:fixed !important; left:0; top:0; bottom:0; z-index:100; width:88% !important; max-width:310px; box-shadow:4px 0 32px rgba(0,0,0,.8); transform:translateX(-100%); transition:transform .25s ease; }
          .sidebar.open{ transform:translateX(0); }
          .right-col{ position:fixed !important; right:0; top:0; bottom:0; z-index:100; width:88% !important; max-width:300px; box-shadow:-4px 0 32px rgba(0,0,0,.8); animation:slideR .25s ease; }
          .desktop-right{ display:none !important; }
          .mob-ham{ display:flex !important; }
          .hide-mobile{ display:none !important; }
          .show-mobile{ display:inline !important; }
          .overlay{ display:block; position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:90; }
          .msgs-scroll{ padding:12px 14px !important; }
          .input-bar{ padding-bottom:env(safe-area-inset-bottom,12px) !important; }
        }
      `}</style>

      {(showSidebar && active) && <div className="overlay" onClick={() => setShowSidebar(false)} />}
      {showRight && <div className="overlay" onClick={() => setShowRight(false)} />}

      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden' }}>

        {/* ══════ HEADER ══════ */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flexShrink:0, height:42, background:C.bg, borderBottom:`1px solid ${C.border}`, zIndex:200 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:28, height:28, background:C.cream, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:C.bg, letterSpacing:'-0.5px' }}>IND</div>
            <span style={{ fontSize:13, fontWeight:800, color:C.cream, letterSpacing:'2px' }}>INDLOVERS CHAT</span>
            <div style={{ width:6, height:6, borderRadius:'50%', background:C.cream, animation:'pulse 2s infinite', opacity:.6 }} />
          </div>
        </div>

        <div className="app-shell" style={{ flex:1, minHeight:0, height:0 }}>

          {/* ══════ SIDEBAR ══════ */}
          <div className={`sidebar${showSidebar ? ' open' : ''}`}>
            <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              {/* Header IND */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:C.cream, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:C.bg, letterSpacing:'-0.5px', boxShadow:'0 4px 16px rgba(244,241,236,.15)' }}>IND</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:C.cream }}>INDLOVERS CHAT</div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.creamDim, display:'flex', alignItems:'center', gap:3, marginTop:1 }}>
                      <span style={{ animation:'pulse 2s infinite', display:'inline-block', width:5, height:5, borderRadius:'50%', background:'#4ade80' }} />
                      {`En vivo · ${counts.pendiente} pendiente${counts.pendiente === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
                <a href="/dashboard" title="Dashboard" style={{ background:'rgba(96,165,250,.14)', border:'1px solid rgba(96,165,250,.3)', color:'#60a5fa', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', flexShrink:0 }}>📊</a>
              </div>
              <div style={{ position:'relative', marginBottom:6 }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:C.creamFaint, fontSize:12, pointerEvents:'none' }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={searchMode === 'mensaje' ? 'Buscar en mensajes (ej: Hoodie)...' : 'Buscar nombre o número...'}
                  style={{ width:'100%', padding:'7px 28px 7px 28px', background:C.surface2, border:`1px solid ${searchMode==='mensaje'?'rgba(96,165,250,.4)':C.border}`, borderRadius:8, color:C.cream, fontSize:12, outline:'none' }} />
                {search && <button onClick={() => setSearch('')} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}>✕</button>}
              </div>
              <div style={{ display:'flex', gap:4, marginBottom:10 }}>
                {[{ key:'contacto', label:'👤 Contactos' }, { key:'mensaje', label:'💬 Mensajes' }].map(({ key, label }) => (
                  <button key={key} onClick={() => setSearchMode(key)} style={{
                    flex:1, padding:'5px 2px', fontSize:10, fontWeight:700, borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                    background: searchMode===key ? 'rgba(96,165,250,.15)' : 'transparent',
                    border: `1px solid ${searchMode===key ? 'rgba(96,165,250,.45)' : C.border}`,
                    color: searchMode===key ? '#60a5fa' : C.creamFaint,
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {[
                  { key:'pendiente',    label:'Pendientes',   icon:'🔴', color:'#f87171' },
                  { key:'atendido',     label:'Atendidos',    icon:'🟢', color:'#4ade80' },
                  { key:'ventaproceso', label:'En proceso',   icon:'🟡', color:'#f59e0b' },
                  { key:'venta',        label:'Ventas',       icon:'💰', color:'#10b981' },
                ].map(({ key, label, icon, color }) => (
                  <button key={key} onClick={() => setFilter(key)} style={{
                    flex:1, padding:'5px 2px', fontSize:9, fontWeight:700,
                    background:filter===key?`${color}18`:'transparent',
                    border:`1px solid ${filter===key?color+'40':C.border}`,
                    color:filter===key?color:C.creamFaint,
                    borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                  }}>
                    {icon} {label}
                    {counts[key]>0 && <span style={{ marginLeft:3, background:filter===key?color:C.border2, color:filter===key?C.bg:C.creamDim, borderRadius:10, padding:'0 4px', fontSize:8, fontWeight:800 }}>{counts[key]}</span>}
                  </button>
                ))}
              </div>
              {/* Soporte + Archivados colapsados */}
              <div style={{ marginTop:4, display:'flex', gap:4 }}>
                <button onClick={() => setFilter('soporte')} style={{
                  flex:1, padding:'4px 8px', fontSize:9, fontWeight:700,
                  background:filter==='soporte'?`rgba(167,139,250,.18)`:'transparent',
                  border:`1px solid ${filter==='soporte'?'rgba(167,139,250,.4)':C.border}`,
                  color:filter==='soporte'?'#a78bfa':C.creamFaint,
                  borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                }}>
                  🎧 Soporte
                  {counts['soporte']>0 && <span style={{ background:filter==='soporte'?'#a78bfa':C.border2, color:filter==='soporte'?C.bg:C.creamDim, borderRadius:10, padding:'0 5px', fontSize:8, fontWeight:800 }}>{counts['soporte']}</span>}
                </button>
                <button onClick={() => setFilter('archivado')} style={{
                  flex:1, padding:'4px 8px', fontSize:9, fontWeight:700,
                  background:filter==='archivado'?`rgba(160,154,144,.18)`:'transparent',
                  border:`1px solid ${filter==='archivado'?'rgba(160,154,144,.4)':C.border}`,
                  color:filter==='archivado'?C.creamDim:C.creamFaint,
                  borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                }}>
                  ⚫ Archivados
                  {counts['archivado']>0 && <span style={{ background:filter==='archivado'?C.creamDim:C.border2, color:filter==='archivado'?C.bg:C.creamFaint, borderRadius:10, padding:'0 5px', fontSize:8, fontWeight:800 }}>{counts['archivado']}</span>}
                </button>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {loading ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:48, gap:12 }}>
                  <Spinner size={24} /><span style={{ fontSize:11, color:C.creamFaint }}>Cargando...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding:28, textAlign:'center', color:C.creamFaint, fontSize:12 }}>
                  {isSearching ? (searchingMsgs ? `Ningún mensaje dice "${search.trim()}"` : `Sin resultados para "${search.trim()}"`) : 'Sin conversaciones'}
                </div>
              ) : (<>
                {isSearching && (
                  <div style={{ padding:'8px 16px 4px', fontSize:10, fontWeight:800, letterSpacing:'.06em', color:C.creamDim }}>
                    {filtered.length} {searchingMsgs ? (filtered.length===1?'CHAT CON':'CHATS CON') : `RESULTADO${filtered.length===1?'':'S'}`}{searchingMsgs ? ' ESE MENSAJE' : ' · TODAS LAS BANDEJAS'}
                  </div>
                )}
                {filtered.map(conv => (
                  <ContactRow key={conv.telefono} conv={{ ...conv, nombre: displayName(conv.telefono) }} isActive={active===conv.telefono} onClick={() => openConv(conv.telefono)}
                    search={search} estado={getStatus(conv.telefono)} msgSnippet={searchingMsgs ? matchSnippet(conv) : null} />
                ))}
              </>)}
            </div>

            <div style={{ padding:'7px 14px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:10, color:C.creamFaint }}>{lastSync?'Sync '+lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}</span>
              <button onClick={() => window.location.reload()} style={{ background:`rgba(244,241,236,.06)`, border:`1px solid rgba(244,241,236,.15)`, color:C.cream, borderRadius:7, width:30, height:30, cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center' }}>↻</button>
            </div>
          </div>

          {/* ══════ CHAT ══════ */}
          {activeConv ? (
            <div className="chat-col">
              {/* Header chat */}
              <div style={{ padding:'8px 10px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', flexWrap:'wrap', flexShrink:0, gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0, flex:'0 0 auto' }}>
                  <button className="mob-ham" onClick={() => setShowSidebar(s=>!s)} style={{ background:'transparent', border:'none', color:C.cream, cursor:'pointer', fontSize:20, padding:'0 2px', lineHeight:1, flexShrink:0 }}>☰</button>
                  <Avatar name={displayName(activeConv.telefono)} phone={activeConv.telefono} size={34} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:800, color:C.cream, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{displayName(activeConv.telefono)}</div>
                    <div style={{ fontSize:9, color:C.creamFaint }}>+{activeConv.telefono}</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', flex:1, justifyContent:'flex-end' }}>
                  {[
                    { s:'pendiente',    icon:'🔴', label:'Pendiente',  activeColor:'#f87171' },
                    { s:'ventaproceso', icon:'🟡', label:'En proceso', activeColor:'#f59e0b' },
                    { s:'venta',        icon:'💰', label:'Venta',      activeColor:'#10b981' },
                    { s:'atendido',     icon:'🟢', label:'Atendido',   activeColor:'#4ade80' },
                    { s:'soporte',      icon:'🎧', label:'Soporte',    activeColor:'#a78bfa' },
                    { s:'archivado',    icon:'⚫', label:'Archivar',   activeColor:C.creamDim },
                  ].map(({ s, icon, label, activeColor }) => (
                    <button key={s} onClick={() => changeStatus(activeConv.telefono, s)} title={label} style={{
                      padding:'4px 6px', fontWeight: currentStatusView===s ? 800 : 600,
                      background: currentStatusView===s ? `${activeColor}22` : 'transparent',
                      border: `${currentStatusView===s ? 2 : 1}px solid ${currentStatusView===s ? activeColor : C.border2}`,
                      color: currentStatusView===s ? activeColor : C.creamFaint,
                      borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                      boxShadow: currentStatusView===s ? `0 0 8px ${activeColor}44` : 'none',
                    }}>
                      <span className="hide-mobile" style={{ fontSize:10 }}>{icon} {label}</span>
                      <span className="show-mobile" style={{ fontSize:14 }}>{icon}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowRight(r=>!r)} className="mob-ham" style={{ background:showRight?`rgba(244,241,236,.1)`:'rgba(255,255,255,.04)', border:`1px solid ${showRight?'rgba(244,241,236,.3)':C.border2}`, color:showRight?C.cream:C.creamFaint, borderRadius:8, width:30, height:28, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>⚡</button>

                  {/* Toggle IA */}
                  {(() => {
                    const iaOn = getModoIA(activeConv.telefono)
                    return (
                      <button onClick={handleToggleIA} disabled={togglingIA}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, cursor:'pointer', fontFamily:'inherit', fontWeight:800, fontSize:10, border:`2px solid ${iaOn ? '#f59e0b' : C.border2}`, background:iaOn?'rgba(245,158,11,.12)':C.surface, color:iaOn?'#f59e0b':C.creamFaint, boxShadow:iaOn?'0 0 10px rgba(245,158,11,.25)':'none', transition:'all .2s', minWidth:80 }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:iaOn?'#f59e0b':C.creamFaint, animation:iaOn?'pulse 2s infinite':'none' }}/>
                        {togglingIA ? '...' : iaOn ? 'IA activa' : 'IA pausada'}
                      </button>
                    )
                  })()}
                </div>
              </div>

              {/* Mensajes */}
              <div ref={msgsRef} className="msgs-scroll" onScroll={handleMsgsScroll} style={{ background:`radial-gradient(ellipse at 20% 10%, rgba(244,241,236,.015) 0%, transparent 60%)` }}>
                {activeConv.msgs.map((msg, idx) => {
                  const showDate = idx===0 || _parseDate(msg.timestamp).toDateString() !== _parseDate(activeConv.msgs[idx-1].timestamp).toDateString()
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div style={{ display:'flex', justifyContent:'center', margin:'12px 0 8px' }}>
                          <span style={{ background:`rgba(244,241,236,.04)`, borderRadius:20, padding:'3px 14px', fontSize:11, color:C.creamFaint }}>{fmtDate(msg.timestamp)}</span>
                        </div>
                      )}
                      <MessageBubble msg={msg} allMsgs={activeConv.msgs} />
                    </div>
                  )
                })}
                {sending && (
                  <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
                    <div style={{ background:C.surface2, borderRadius:'18px 18px 4px 18px', padding:'9px 14px', border:`1px solid ${C.border2}` }}>
                      <span style={{ color:C.creamDim, fontSize:12, animation:'blink 1s infinite' }}>Enviando...</span>
                    </div>
                  </div>
                )}
                <Toast result={toast} />
                <div ref={endRef} />
              </div>

              {/* Input bar */}
              <div className="input-bar" style={{ position:'relative' }}>
                {!windowOpen && lastIncoming && (
                  <div style={{ marginBottom:8, padding:'5px 12px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', borderRadius:8, fontSize:11, color:'#fbbf24', textAlign:'center' }}>
                    ⚠️ Ventana de 24h cerrada
                  </div>
                )}
                {imgFiles.length > 0 && (
                  <div style={{ marginBottom:8, padding:'8px 12px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12 }}>
                    {/* Grid de previews */}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                      {imgFiles.map((item, i) => (
                        <div key={i} style={{ position:'relative' }}>
                          {isVideo
                            ? <video src={item.preview} style={{ width:64, height:44, borderRadius:8, objectFit:'cover' }} muted />
                            : <img src={item.preview} style={{ width:44, height:44, borderRadius:8, objectFit:'cover' }} alt={`preview-${i}`} />
                          }
                          {/* Indicador de enviada */}
                          {imgUploading && imgProgress > i && (
                            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✓</div>
                          )}
                          {/* Botón eliminar individual */}
                          {!imgUploading && !imgResult && (
                            <button onClick={() => setImgFiles(prev => prev.filter((_,j) => j!==i))}
                              style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', background:'#f87171', border:'none', color:'#fff', fontSize:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:10, color:C.creamFaint }}>
                        {imgUploading
                          ? `Enviando ${imgProgress}/${imgFiles.length}...`
                          : imgResult
                            ? imgResult.ok ? `✓ ${imgFiles.length} enviada${imgFiles.length>1?'s':''}` : '✗ Error al enviar'
                            : `${imgFiles.length} foto${imgFiles.length>1?'s':''} seleccionada${imgFiles.length>1?'s':''}`
                        }
                      </span>
                      {!imgResult && (
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={handleSendImage} disabled={imgUploading||!windowOpen}
                            style={{ padding:'5px 10px', background:imgUploading?C.surface2:C.cream, border:'none', borderRadius:7, color:imgUploading?C.creamFaint:C.bg, fontSize:11, fontWeight:700, cursor:imgUploading?'default':'pointer', fontFamily:'inherit' }}>
                            {imgUploading?'⏳':'📤 Enviar'}
                          </button>
                          <button onClick={cancelImage} style={{ padding:'5px 8px', background:'transparent', border:`1px solid ${C.border2}`, borderRadius:7, color:C.creamFaint, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  <button onClick={() => fileRef.current?.click()} style={{ width:42, height:42, flexShrink:0, background:imgFiles.length?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${imgFiles.length?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:17, display:'flex', alignItems:'center', justifyContent:'center', color:imgFiles.length?C.cream:C.creamDim, transition:'all .15s', position:'relative' }}>
                    📎
                    {imgFiles.length > 0 && <span style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', background:C.cream, color:C.bg, fontSize:8, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{imgFiles.length}</span>}
                  </button>
                  <button onClick={() => setShowBtnPanel(p=>!p)} style={{ width:42, height:42, flexShrink:0, background:showBtnPanel?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${showBtnPanel?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', color:showBtnPanel?C.cream:C.creamDim, transition:'all .15s' }}>🔘</button>
                  <button onClick={() => { setShowEmoji(p=>!p); setShowBtnPanel(false) }} style={{ width:42, height:42, flexShrink:0, background:showEmoji?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${showEmoji?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>😊</button>
                  <input ref={fileRef} type="file" accept="image/*,video/mp4,video/3gpp,video/quicktime" multiple style={{ display:'none' }} onChange={handleFileSelect} />

                  {showEmoji && <EmojiPicker onSelect={(emoji) => setInput(prev => prev + emoji)} onClose={() => setShowEmoji(false)} />}

                  {showBtnPanel && (
                    <div style={{ position:'absolute', bottom:'100%', left:16, right:16, marginBottom:8, padding:'10px 12px', background:C.surface2, border:`1px solid rgba(244,241,236,.2)`, borderRadius:12, zIndex:50 }}>
                      <div style={{ fontSize:10, color:C.cream, fontWeight:700, marginBottom:7, letterSpacing:'.06em' }}>🔘 BOTONES INTERACTIVOS</div>
                      {btnTexts.map((txt,i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                          <span style={{ fontSize:10, color:C.creamFaint, width:12, flexShrink:0 }}>{i+1}.</span>
                          <input value={txt} onChange={e => setBtnTexts(prev=>prev.map((v,j)=>j===i?e.target.value:v))} placeholder={`Botón ${i+1}`} maxLength={20}
                            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 9px', color:C.cream, fontSize:11, outline:'none', fontFamily:'inherit' }}
                            onFocus={e=>e.target.style.borderColor=C.cream} onBlur={e=>e.target.style.borderColor=C.border} />
                        </div>
                      ))}
                      {btnTexts.some(t=>t.trim()) && !input.trim() ? (
                        <div style={{ marginTop:5, padding:'5px 9px', background:'rgba(245,158,11,.14)', border:'1px solid rgba(245,158,11,.35)', borderRadius:7, fontSize:10, color:'#f59e0b', fontWeight:600 }}>
                          ⚠️ Falta escribir el mensaje (va arriba de los botones) — luego dale a ➤
                        </div>
                      ) : (
                        <div style={{ fontSize:9, color:C.creamFaint, marginTop:3 }}>Escribe el mensaje abajo y dale a enviar · Máx 3 botones</div>
                      )}
                    </div>
                  )}

                  <div style={{ flex:1, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:13, padding:'9px 13px', position:'relative' }}>
                    <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                      placeholder={getModoIA(activeConv?.telefono) ? '🤖 IA respondiendo automáticamente...' : 'Escribe un mensaje... (Ctrl+Enter para enviar)'}
                      rows={2}
                      style={{ width:'100%', background:'transparent', border:'none', outline:'none', color:C.cream, fontSize:14, resize:'none', lineHeight:1.5, minHeight:44, maxHeight:120, overflowY:'auto' }} />
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                    {(() => {
                      // UN SOLO botón: manda CON botones si el panel tiene botones; si no, solo texto.
                      const conBotones = showBtnPanel && btnTexts.some(t => t.trim())
                      const busy = sending || sendingBtns
                      const activo = !!input.trim() && windowOpen && !busy
                      return (
                        <button
                          onClick={() => { if (conBotones) handleSendButtons(); else handleSend() }}
                          disabled={!activo}
                          title={conBotones ? 'Enviar con botones' : 'Enviar'}
                          style={{ width:42, height:42, flexShrink:0, border:'none', borderRadius:11, cursor: activo ? 'pointer' : 'default', fontSize: conBotones ? 15 : 17, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s',
                            background: activo ? (conBotones ? '#f59e0b' : C.cream) : C.surface2,
                            color: activo ? (conBotones ? '#fff' : C.bg) : C.creamFaint,
                            boxShadow: activo ? (conBotones ? '0 4px 14px rgba(245,158,11,.3)' : `0 4px 14px rgba(244,241,236,.2)`) : 'none' }}>
                          {busy ? '⏳' : (conBotones ? '🔘' : '➤')}
                        </button>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, position:'relative' }}>
              <button className="mob-ham" onClick={() => setShowSidebar(true)} style={{ position:'absolute', top:14, left:14, background:`rgba(244,241,236,.06)`, border:`1px solid rgba(244,241,236,.15)`, color:C.cream, borderRadius:9, width:38, height:38, cursor:'pointer', fontSize:18, display:'none', alignItems:'center', justifyContent:'center' }}>☰</button>
              <div style={{ fontSize:52, opacity:.05 }}>💬</div>
              <p style={{ color:C.creamFaint, fontSize:13, fontWeight:700 }}>{loading?'Cargando...':'Selecciona una conversación'}</p>
            </div>
          )}

          {/* RIGHT PANEL desktop */}
          {activeConv && (
            <div className="desktop-right right-col">
              <RightPanel activeConv={activeConv} contactInfo={currentContact} onQuickReply={handleQuickReply} onSendText={handleSendText} onSendImage={handleSendAIImage} onUpdateContact={handleUpdateContact} windowOpen={windowOpen} />
            </div>
          )}
          {showRight && activeConv && (
            <div className="right-col">
              <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 10px 0' }}>
                <button onClick={() => setShowRight(false)} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:17 }}>✕</button>
              </div>
              <RightPanel activeConv={activeConv} contactInfo={currentContact} onQuickReply={handleQuickReply} onSendText={handleSendText} onSendImage={handleSendAIImage} onUpdateContact={handleUpdateContact} windowOpen={windowOpen} />
            </div>
          )}

        </div>
      </div>
    </>
  )
}
