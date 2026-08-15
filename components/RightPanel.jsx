'use client'
import { useState, useRef, useEffect } from 'react'
import { Avatar } from '@/components/Components'
import { fetchRepliesFromSheet, writeReply, reorderReplies, addNota, setIdVenta, fetchProductos, generarLinkPago } from '@/lib/api-client'
import Notas from './Notas'
import PedidoManual from './PedidoManual'
import VerPedido from './VerPedido'
import { textoNotaPedido } from '@/lib/pedido-manual'
import { parseDate } from '@/lib/utils'
import { moverItem } from '@/lib/orden-lista'

const MAX_IMGS  = 10

const C = {
  bg:        '#0A0A0A', surface:'#0D0D0D', surface2:'#111111',
  border:    '#1F1F1F', border2:'#2A2A2A',
  cream:     '#F4F1EC', creamDim:'#A09A90', creamFaint:'#3A3530',
}

// ── Tarjeta de un pedido del historial (MANDARINACRM) ────────────
function PedidoCard({ p, onVer }) {
  const est       = String(p.estado || '').toUpperCase()
  const pago      = String(p.estadoPago || '').toUpperCase()
  const entregado = /ENTREG/.test(est)
  const pagado    = /PAG/.test(pago)
  const estColor  = entregado ? '#10b981' : '#f59e0b'
  const items     = p.items || []
  return (
    <div style={{ padding:'7px 9px', background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:11, fontWeight:800, color:C.cream }}>
          <span style={{ color: estColor }}>{entregado ? '●' : '○'}</span> {p.id || 'Pedido'}
        </span>
        <span style={{ fontSize:10, color:C.creamDim, flexShrink:0 }}>
          {p.fecha} · <strong style={{ color:'#10b981' }}>${Number(p.total || 0).toFixed(2)}</strong>
        </span>
      </div>
      {items.slice(0, 4).map((it, i) => (
        <div key={i} style={{ fontSize:11, color:C.creamDim, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          • {it.producto}{it.talla ? ` · ${it.talla}` : ''}{it.color ? ` · ${it.color}` : ''}{it.cantidad > 1 ? ` ×${it.cantidad}` : ''}
        </div>
      ))}
      {items.length > 4 && (
        <div style={{ fontSize:10, color:C.creamFaint, marginTop:2 }}>+{items.length - 4} ítem{items.length - 4 === 1 ? '' : 's'} más…</div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5, flexWrap:'wrap' }}>
        <span style={{ fontSize:8.5, fontWeight:800, color:estColor, background:`${estColor}1e`, border:`1px solid ${estColor}44`, borderRadius:5, padding:'1px 6px' }}>{p.estado || '—'}</span>
        <span style={{ fontSize:8.5, fontWeight:800, color: pagado ? '#10b981' : '#f87171', background: pagado ? 'rgba(16,185,129,.12)' : 'rgba(248,113,113,.12)', border:`1px solid ${pagado ? 'rgba(16,185,129,.35)' : 'rgba(248,113,113,.35)'}`, borderRadius:5, padding:'1px 6px' }}>{p.estadoPago || 'PENDIENTE'}</span>
        {/* "Ver" abre el pedido DENTRO del panel, no en una pestaña nueva: eso
            te sacaba del chat justo cuando estás atendiendo. Se necesita el
            número de pedido, que es con lo que se arma la url (ver
            `urlVerPedido`); sin número no hay a dónde ir y no se pinta. */}
        {p.id && onVer && (
          <button onClick={() => onVer(p.id)} title="Ver el pedido acá mismo"
            style={{ marginLeft:'auto', background:'transparent', border:'none', padding:0, fontSize:9, fontWeight:700, color:'#60a5fa', cursor:'pointer', fontFamily:'inherit' }}>
            Ver →
          </button>
        )}
      </div>
    </div>
  )
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

// Sube un archivo a NUESTRO bucket (Supabase Storage) y devuelve la url pública.
// Antes iba a imgbb: un tercero que, cuando le fallaba a los servidores de Meta,
// tumbaba el envío de fotos. Ahora la url es nuestra y estable.
async function subirFoto(file) {
  const converted = await toJpeg(file)
  const fd = new FormData()
  fd.append('file', converted, converted.name || 'imagen.jpg')
  const res  = await fetch('/api/upload-foto', { method:'POST', body:fd })
  const data = await res.json()
  if (!data.url) throw new Error(data.error || 'No se pudo subir la foto')
  return data.url
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
      const url = await subirFoto(f).catch(e => { console.error('[RightPanel] subirFoto:', e); return '' })
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
        {p.fuente === 'sucursal' ? (
          <span style={{ fontSize:9, color:C.creamFaint }}>
            {[p.talla, p.color].filter(Boolean).join(' · ')}{(p.talla || p.color) ? ' · ' : ''}
            <span style={{ color: p.stock > 0 ? '#10b981' : '#f87171', fontWeight:700 }}>{p.stock > 0 ? `${p.stock} en stock` : 'sin stock'}</span>
          </span>
        ) : p.variants?.length > 0 ? (
          <span style={{ fontSize:9, color:C.creamFaint }}>{p.variants.length} variante{p.variants.length === 1 ? '' : 's'}</span>
        ) : null}
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
// Etiqueta del catálogo online en el selector de la pestaña Tienda (este inbox = INDLOVERS).
const CATALOGO_LABEL = 'INDLOVERS'

export default function RightPanel({ activeConv, onQuickReply, onSendText, onSendImage, onSendProducto, contactInfo, onUpdateContact, windowOpen, onPedidoManual, onVerPedido, onEnviarHojaPedido }) {
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
  const [arrastrando, setArrastrando] = useState(null)   // índice que se está arrastrando
  const [errorOrden, setErrorOrden]   = useState('')     // aviso si el guardado del orden falla
  // Ids de respuestas cuya ALTA todavía no fue confirmada por el servidor (el POST
  // de addReply sigue en vuelo). Mientras un id esté aquí no se deja editar ni
  // reordenar esa fila: ver el comentario dentro de addReply para la carrera que evita.
  const [savingIds, setSavingIds] = useState(() => new Set())
  // Se guarda el ID de la respuesta en edición, NO su índice: con flechas y
  // arrastre el índice de la fila puede cambiar mientras el formulario de edición
  // sigue abierto (otra fila se mueve y cruza esa posición). Si se guardara por
  // índice, `saveEdit` podría escribir el texto sobre OTRA respuesta.
  const [editingId,      setEditingId]     = useState(null)
  const [editText,      setEditText]      = useState('')
  const [editImgUrls,   setEditImgUrls]   = useState([])
  const [newText,       setNewText]       = useState('')
  const [newImgUrls,    setNewImgUrls]    = useState([])
  const [editBotones,   setEditBotones]   = useState(['', '', ''])
  const [newBotones,    setNewBotones]    = useState(['', '', ''])
  // Respuestas rápidas EN VUELO: { [idx]: '⏳' | '3/5' }. Es un mapa y no un solo
  // índice a propósito — antes el panel esperaba a que terminara una para dejar
  // mandar otra, y con 5 fotos eso eran 40 segundos de brazos cruzados.
  const [sending,       setSending]       = useState({})
  const [editAlias,     setEditAlias]     = useState(false)
  const [aliasInput,    setAliasInput]    = useState('')
  // El componente <Notas/> se maneja solo (lee y escribe su propia tabla). Este
  // contador es la única señal que necesita de afuera: el PEDIDO MANUAL deja el link
  // del pedido como nota y lo sube para que la lista se repinte.
  const [notasRefrescar, setNotasRefrescar] = useState(0)

  // ── Resultado del último pedido creado ───────────────────────
  // Lo llena el PEDIDO MANUAL desde su `onCreado` y es lo que pinta el aviso
  // "✅ Pedido creado" más abajo. Se limpia al cambiar de contacto.
  const [pedidoRes,     setPedidoRes]     = useState(null)

  // ── LINK PAGO: genera el link dLocal y deja el mensaje completo en la nota ──
  // NO se manda nada al chat desde acá — el vendedor copia la nota y decide
  // cuándo y cómo mandarlo. Portado desde MANDI el 15-ago-2026 (decisión
  // explícita del dueño: IND reutiliza la cuenta dLocal de MANDI, ver
  // lib/dlocal.js). `/api/linkpago` ya deja el texto COMPLETO (no un resumen)
  // como nota neutral — con el botón de copiar de <Notas/> — así que acá no se
  // guarda ningún resultado: el panel se limpia solo después de generar,
  // listo para otro monto en el mismo cliente. La nota es también el
  // diagnóstico: si nunca aparece una verde después, dLocal no está avisando
  // el pago (ver app/api/pago-dlocal/route.js).
  const [montoLink,     setMontoLink]     = useState('')
  const [generandoLink, setGenerandoLink] = useState(false)
  const [linkPagoError, setLinkPagoError] = useState('')

  // ── PEDIDO MANUAL: el formulario del CRM dentro de este panel ──
  const [manualAbierto, setManualAbierto] = useState(false)

  // ── VER PEDIDO: un pedido del CRM, de solo lectura, en este mismo panel ──
  // Guarda el NÚMERO del pedido que se está mirando (null = ninguno). El número
  // y no la url: la url se arma sola en `urlVerPedido`, contra el dominio del
  // CRM donde vale la sesión.
  //
  // ⚠️ Es un estado APARTE de `manualAbierto` y avisa por un camino APARTE
  // (`onVerPedido`, no `onPedidoManual`). Mezclarlos era lo fácil —los dos
  // ensanchan el panel— y habría metido esta vista en el guard que pregunta
  // "¿lo descartas?": acá no hay nada escrito que perder, así que preguntar
  // sería puro ruido cada vez que alguien cierra un pedido que solo estaba
  // mirando.
  const [verPedidoId, setVerPedidoId] = useState(null)

  // ── Historial de pedidos del cliente (desde MANDARINACRM) ────
  const [historial,   setHistorial]   = useState(null)  // null = cargando
  const [histError,   setHistError]   = useState(false)
  const histLoadedRef = useRef(null)

  // ── Catálogo TIENDA (Shopify INDSTORE) ───────────────────────
  const [fuente,          setFuente]          = useState('shopify') // 'shopify' | 'sucursal'
  const [prodCache,       setProdCache]       = useState({})        // { shopify:[...], sucursal:[...] }
  const [prodQuery,       setProdQuery]       = useState('')
  // Productos en vuelo: { [id]: 'foto' | 'info' }. Era un solo producto a la vez y
  // eso bloqueaba TODA la grilla mientras salía una foto: no se podía ni elegir el
  // siguiente. Ahora solo se bloquea la tarjeta que ya está enviando.
  const [prodSending,     setProdSending]     = useState({})
  const productos = prodCache[fuente] ?? null                       // null = cargando

  // Nombrada aparte del useEffect porque reordenar() la vuelve a llamar cuando el
  // guardado del orden falla: el servidor escribe el orden fila por fila (no es
  // atómico), así que un fallo a mitad de camino deja la base con parte del orden
  // nuevo y parte del viejo. "Volver al orden anterior en memoria" ya no alcanza
  // porque ese orden anterior puede no ser lo que quedó guardado — hay que traer
  // la verdad desde el servidor.
  const cargarReplies = () => {
    fetchRepliesFromSheet().then(data => { setReplies(data || []); setRepliesLoaded(true) })
  }

  useEffect(() => {
    if (repliesLoaded) return
    cargarReplies()
  }, [repliesLoaded])

  // Limpiar el resultado del último pedido al cambiar de contacto — si no,
  // el pedido del chat anterior sigue en pantalla. (Las notas las carga <Notas/>
  // por su cuenta cuando cambia el teléfono.)
  useEffect(() => {
    if (activeConv) setPedidoRes(null)
  }, [activeConv?.telefono])

  // Mismo motivo que arriba: el link generado es del chat anterior, no de este.
  useEffect(() => {
    setMontoLink(''); setLinkPagoError('')
  }, [activeConv?.telefono])

  async function generarLink() {
    if (generandoLink || !activeConv) return
    setGenerandoLink(true); setLinkPagoError('')
    try {
      await generarLinkPago(activeConv.telefono, Number(montoLink))
      // El texto completo ya quedó guardado como nota en el servidor (con su
      // propio botón de copiar) — acá solo se limpia el monto para dejar el
      // panel listo si toca generar otro, sin nada que reconstruir.
      setMontoLink('')
      setNotasRefrescar(n => n + 1)
    } catch (e) {
      setLinkPagoError(e.message)
    } finally {
      setGenerandoLink(false)
    }
  }

  // Avisarle al padre cuando se abre o se cierra el PEDIDO MANUAL: con eso
  // ensancha el panel y sabe que tiene que preguntar antes de cambiar de chat.
  useEffect(() => { onPedidoManual?.(manualAbierto) }, [manualAbierto, onPedidoManual])

  // Al desmontarse el panel, el formulario se va con él. Hay que avisarlo o el
  // padre seguiría creyendo que está abierto y preguntaría de gusto para siempre.
  const avisarRef = useRef(onPedidoManual)
  useEffect(() => { avisarRef.current = onPedidoManual }, [onPedidoManual])
  useEffect(() => () => { avisarRef.current?.(false) }, [])

  // ☠️ Al cambiar de conversación se cierra: dejarlo abierto mostraría el
  // formulario precargado con el cliente ANTERIOR, que es la peor forma de
  // equivocarse.
  //
  // NO BORRES ESTA LÍNEA aunque parezca que sobra. Desde que el formulario
  // sobrevive al cambio de pestaña, es tentador pensar que también debería
  // sobrevivir al cambio de chat. NO: `PedidoManual` congela su URL con un
  // `useState` de inicializador perezoso, que solo se vuelve a ejecutar si el
  // componente se MONTA de nuevo. Esta línea es lo único que fuerza ese
  // desmontaje. Sin ella, la URL conserva el teléfono del cliente anterior y el
  // siguiente pedido sale a nombre equivocado, sin ningún error a la vista.
  useEffect(() => { setManualAbierto(false) }, [activeConv?.telefono])

  // Avisarle al padre cuando se abre o se cierra VER PEDIDO: con eso ensancha el
  // panel, que es lo ÚNICO que comparte con el formulario. NO toca el guard.
  useEffect(() => { onVerPedido?.(verPedidoId != null) }, [verPedidoId, onVerPedido])

  // Igual que con el formulario: si el panel se desmonta, el padre tiene que
  // enterarse o se queda con el panel ancho para siempre.
  const avisarVerRef = useRef(onVerPedido)
  useEffect(() => { avisarVerRef.current = onVerPedido }, [onVerPedido])
  useEffect(() => () => { avisarVerRef.current?.(false) }, [])

  // ☠️ Al cambiar de conversación se cierra, por el mismo motivo que el
  // formulario: `MarcoCRM` congela su url al MONTAR, y este desmontaje es lo
  // único que la vuelve a inicializar. Sin esto te quedarías mirando el pedido
  // del cliente anterior mientras la cabecera dice otro nombre.
  useEffect(() => { setVerPedidoId(null) }, [activeConv?.telefono])

  const loadHistorial = async (tel, idVenta) => {
    setHistorial(null); setHistError(false)
    try {
      const url = `/api/cliente-pedidos?telefono=${encodeURIComponent(tel)}${idVenta ? `&idVenta=${encodeURIComponent(idVenta)}` : ''}`
      const r = await fetch(url)
      if (!r.ok) throw new Error('http ' + r.status)
      const d = await r.json()
      if (histLoadedRef.current === tel) setHistorial(d)
    } catch {
      if (histLoadedRef.current === tel) setHistError(true)
    }
  }

  // Cargar historial de pedidos al cambiar de contacto (una sola vez por teléfono)
  useEffect(() => {
    if (!activeConv) return
    if (histLoadedRef.current === activeConv.telefono) return
    histLoadedRef.current = activeConv.telefono
    loadHistorial(activeConv.telefono, contactInfo?.idVenta)
  }, [activeConv, contactInfo])

  // Cargar el catálogo de la fuente activa la PRIMERA vez (perezoso, cacheado por fuente)
  useEffect(() => {
    if (tab !== 'tienda' || prodCache[fuente]) return
    let cancel = false
    fetchProductos('', fuente).then(list => {
      if (!cancel) setProdCache(prev => ({ ...prev, [fuente]: list || [] }))
    })
    return () => { cancel = true }
  }, [tab, fuente, prodCache])

  if (!activeConv) return null

  const startEdit = (idx) => {
    setEditingId(replies[idx].id)
    setEditText(replies[idx].text)
    setEditImgUrls(getImgUrls(replies[idx]))
    const b = replies[idx].botones || []
    setEditBotones([b[0] || '', b[1] || '', b[2] || ''])
  }
  const clearEdit = () => { setEditingId(null); setEditText(''); setEditImgUrls([]); setEditBotones(['', '', '']) }
  const saveEdit = async () => {
    if (!editText.trim()) return
    // Se busca la fila por ID en el momento de GUARDAR (no se reutiliza el índice
    // que tenía al ABRIR el formulario): entre medio pudo haberse reordenado la
    // lista con las flechas o el arrastre, y el índice de esta respuesta pudo
    // haber cambiado. Si la respuesta ya no está (alguien la borró mientras se
    // editaba) no se escribe nada y se avisa con el mismo mecanismo que el error
    // de orden.
    const actual = replies.find(r => r.id === editingId)
    if (!actual) {
      clearEdit()
      setErrorOrden('Esa respuesta ya no existe. No se guardó.')
      setTimeout(() => setErrorOrden(''), 4000)
      return
    }
    const botones = editBotones.map(s => s.trim()).filter(Boolean).slice(0, 3)
    const updated = { ...actual, text: editText.trim(), ...urlsToReply(editImgUrls), botones }
    setReplies(prev => prev.map(r => r.id === editingId ? updated : r))
    clearEdit()
    await writeReply('actualizar', updated)
  }
  const deleteReply = async (idx) => {
    const r = replies[idx]; setReplies(prev => prev.filter((_,i) => i!==idx))
    await writeReply('eliminar', r)
  }

  // Reordena en pantalla YA y guarda detrás. Si el guardado falla, VUELVE al orden
  // anterior y avisa: una lista que se ve reordenada y no lo está en la base es
  // peor que no poder reordenar.
  const reordenar = async (desde, hacia) => {
    // Bloqueo GLOBAL, no por fila: mientras haya CUALQUIER alta sin confirmar
    // (savingIds no vacío) no se reordena nada, sea cual sea la fila que se
    // mueva o sobre la que se suelte. El id de la fila sin confirmar todavía no
    // existe en la base, y un UPDATE de orden sobre un id inexistente no falla
    // ni avisa (no afecta ninguna fila) — pero el alta la inserta de todas formas
    // arriba de todo, así que la pantalla terminaría mostrando un orden que la
    // base no tiene. Deshabilitar solo la fila afectada no alcanza: arrastrar
    // OTRA fila y soltarla encima de la que falta confirmar, o subir su vecina
    // con la flecha, disparan el mismo problema. Bloquear todo es más simple y
    // más seguro, y la ventana dura lo que tarda un POST.
    if (savingIds.size > 0) return
    const previa = replies
    const nueva = moverItem(previa, desde, hacia)
    if (nueva.length !== previa.length) return
    if (nueva.every((r, i) => r === previa[i])) return   // no cambió nada
    setReplies(nueva)
    setErrorOrden('')
    const r = await reorderReplies(nueva.map(x => x.id))
    if (!r?.ok) {
      setReplies(previa)
      setErrorOrden('No se pudo guardar el orden. Reintenta.')
      setTimeout(() => setErrorOrden(''), 4000)
      // El guardado no es atómico (fila por fila): un fallo a mitad de camino
      // puede dejar la base con parte del orden nuevo y parte del viejo, así que
      // "previa" ya no es necesariamente lo que quedó guardado. Se recarga desde
      // el servidor para que la pantalla termine mostrando lo que hay de verdad.
      cargarReplies()
    }
  }

  const addReply = async () => {
    if (!newText.trim()) return
    const botones = newBotones.map(s => s.trim()).filter(Boolean).slice(0, 3)
    const nr = { id: crypto.randomUUID(), text: newText.trim(), ...urlsToReply(newImgUrls), botones }
    setReplies(prev => [nr, ...prev])   // la nueva entra PRIMERA, igual que en la base
    // Se marca como "guardando" mientras el POST de alta sigue en vuelo. addReply
    // mete la respuesta en el estado ANTES de esperar la confirmación del servidor,
    // así que si se editara/reordenara en esa ventana la corrección se perdería o
    // se le mandaría al servidor un id que todavía no existe. Ver reordenar().
    setSavingIds(prev => new Set(prev).add(nr.id))
    setNewText(''); setNewImgUrls([]); setNewBotones(['', '', ''])
    await writeReply('agregar', nr)
    setSavingIds(prev => { const n = new Set(prev); n.delete(nr.id); return n })
  }

  // No se espera a que termine: se dispara y el botón va mostrando "2/5". Así el
  // vendedor puede mandar otra respuesta rápida (o escribir) mientras las fotos
  // de la anterior siguen saliendo. El único bloqueo que queda es el doble clic
  // sobre LA MISMA respuesta.
  const handleSendQuick = (idx) => {
    if (sending[idx]) return
    const marcar = (v) => setSending(prev => ({ ...prev, [idx]: v }))
    const soltar = () => setSending(prev => { const n = { ...prev }; delete n[idx]; return n })
    marcar('⏳')
    Promise.resolve(
      onQuickReply(replies[idx], (hechas, total) => marcar(total > 1 ? `${hechas}/${total}` : '⏳')),
    ).catch(() => {}).finally(soltar)
  }

  // ── TIENDA: enviar producto ──────────────────────────────────
  const productosFiltrados = (productos || []).filter(p =>
    !prodQuery.trim() || String(p.title).toLowerCase().includes(prodQuery.trim().toLowerCase())
  )
  const marcarProd = (id, modo) => setProdSending(prev => ({ ...prev, [id]: modo }))
  const soltarProd  = (id) => setTimeout(
    () => setProdSending(prev => { const n = { ...prev }; delete n[id]; return n }),
    600,
  )
  // Título+foto se mandan con UNA sola llamada (onSendProducto) para que entren
  // juntos a la fila del chat: en dos pasos, algo clickeado en el medio podía
  // colarse entre el título del producto y su foto.
  const sendProducto = async (p, modo) => {
    if (!windowOpen || prodSending[p.id]) return
    marcarProd(p.id, modo)
    try { await onSendProducto?.(p, modo) }
    finally { soltarProd(p.id) }
  }
  const sendProductoFoto = (p) => sendProducto(p, 'foto')
  const sendProductoInfo = (p) => sendProducto(p, 'info')

  // Acá vivía `crearPedido`, el botón "🤖 CREAR PEDIDO CON IA": mandaba la
  // conversación entera a `indx-agent` y el pedido quedaba firmado por un
  // vendedor quemado, o sea a nombre de nadie. Lo reemplaza el PEDIDO MANUAL,
  // que abre la pantalla real del CRM y firma con la persona que la usa. En 7
  // días se usó 2 veces. Está en el historial de git si algún día se lo quiere
  // de vuelta. (Ojo: esto NO es la IA que contesta los chats — esa vive en el
  // webhook, `/api/agent`, y sigue igual.)

  const contactName = contactInfo?.alias||contactInfo?.nombre||activeConv.nombre
  // Ver el comentario dentro de reordenar(): el bloqueo por alta sin confirmar es
  // GLOBAL (toda la lista), no solo la fila nueva — se calcula una vez acá para
  // deshabilitar las flechas de TODAS las filas y para que el onDrop las ignore.
  const hayAltaPendiente = savingIds.size > 0
  const btnBase  = { fontFamily:'inherit', cursor:'pointer', transition:'all .15s' }
  const inputBase = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:7, color:C.cream, fontSize:12, padding:'6px 9px', outline:'none', fontFamily:'inherit' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.surface, overflow:'hidden' }}>

      {/* ── HEADER FIJO: INFO CONTACTO + VENTANA ── */}
      {/* Se esconde mientras el PEDIDO MANUAL está abierto: con el formulario a
          la vista, el nombre del cliente y el contador de la ventana no aportan
          nada y le roban alto al asistente del CRM, que ya va justo. Vuelve solo
          al cerrarlo.
          Ojo: es solo el pintado. `contactName` se sigue calculando arriba y es
          lo que arma la URL del formulario, así que no se rompe nada.
          De regalo saca de la vista el ✏️ del alias, que era lo único que podía
          recargar el iframe estando abierto. */}
      {!manualAbierto && (
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
      )}

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
                // Alta todavía sin confirmar (ver addReply): no se deja editar ni
                // reordenar esta fila hasta que el servidor la confirme.
                const guardando = savingIds.has(reply.id)
                return (
                  <div key={reply.id||idx}>
                    {editingId===reply.id ? (
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
                      <div
                        draggable={!guardando}
                        onDragStart={() => setArrastrando(idx)}
                        onDragEnd={() => setArrastrando(null)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          // Se ignora el drop entero (no solo si la fila afectada es la
                          // que falta confirmar) mientras haya CUALQUIER alta pendiente:
                          // ver el comentario largo en reordenar().
                          if (!hayAltaPendiente && arrastrando !== null && arrastrando !== idx) reordenar(arrastrando, idx)
                          setArrastrando(null)
                        }}
                        style={{ background:`rgba(244,241,236,.02)`, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden', transition:'background .1s',
                          opacity: arrastrando === idx ? .4 : 1,
                          outline: arrastrando !== null && arrastrando !== idx ? `1px dashed ${C.border2}` : 'none',
                        }}
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
                            <button onClick={() => reordenar(idx, idx - 1)} disabled={idx === 0 || hayAltaPendiente}
                              title={hayAltaPendiente ? 'Espera a que se confirme el alta pendiente' : 'Subir'}
                              style={{ background:'transparent', border:`1px solid ${C.border}`, color: (idx === 0 || hayAltaPendiente) ? C.creamFaint : C.creamDim, borderRadius:5, padding:'0 3px', height:20, fontSize:9, cursor: (idx === 0 || hayAltaPendiente) ? 'default' : 'pointer', fontFamily:'inherit' }}>↑</button>
                            <button onClick={() => reordenar(idx, idx + 1)} disabled={idx === replies.length - 1 || hayAltaPendiente}
                              title={hayAltaPendiente ? 'Espera a que se confirme el alta pendiente' : 'Bajar'}
                              style={{ background:'transparent', border:`1px solid ${C.border}`, color: (idx === replies.length - 1 || hayAltaPendiente) ? C.creamFaint : C.creamDim, borderRadius:5, padding:'0 3px', height:20, fontSize:9, cursor: (idx === replies.length - 1 || hayAltaPendiente) ? 'default' : 'pointer', fontFamily:'inherit' }}>↓</button>
                            <button onClick={()=>handleSendQuick(idx)} disabled={!!sending[idx]||!windowOpen}
                              style={{ ...btnBase, background:`rgba(244,241,236,.1)`, border:`1px solid rgba(244,241,236,.2)`, color:C.cream, borderRadius:5, minWidth:20, height:20, padding:'0 3px', cursor:'pointer', fontSize:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {sending[idx] || '➤'}
                            </button>
                            <button onClick={()=>startEdit(idx)} disabled={guardando} title={guardando ? 'Espera a que se confirme el alta' : undefined} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor: guardando ? 'default' : 'pointer', fontSize:10, padding:'0 2px' }}>✏️</button>
                            <button onClick={()=>deleteReply(idx)} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:10, padding:'0 2px' }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {errorOrden && (
                <div style={{ fontSize:11, color:'#ef4444', padding:'6px 8px' }}>⚠️ {errorOrden}</div>
              )}
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

        {/* ═══════════ VENTAS: PEDIDO MANUAL + NOTAS ═══════════ */}
        {/* Con el PEDIDO MANUAL abierto este bloque se ESCONDE en vez de
            desmontarse. Desmontarlo mataba el iframe, y eso encadenaba tres
            desgracias: (1) tocar "Tienda" para mirar el catálogo —el clic más
            natural del mundo mientras armas un pedido— tiraba lo escrito sin
            aviso; (2) `manualAbierto` seguía en true y el padre creía que estaba
            abierto, así que preguntaba de gusto; y (3) al aceptar esa pregunta se
            limpiaba el mapa del guard mientras `manualAbierto` seguía true, y al
            volver a Ventas el formulario se remontaba CON EL GUARD APAGADO: a
            partir de ahí un pedido lleno se descartaba en silencio.
            Escondiéndolo, el formulario sobrevive el paseo por las otras
            pestañas y el estado nunca miente. `display:'contents'` para que el
            envoltorio no genere caja y el layout quede exactamente igual que
            antes; cuando no hay manual abierto, el bloque se desmonta como
            siempre y no cambia nada. */}
        {/* VER PEDIDO se cuela en la misma condición: recargar el pedido cada
            vez que pasas por "Tienda" sería una vuelta al CRM al pepe y
            perderías dónde ibas leyendo. Cuesta lo mismo dejarlo montado. */}
        {(tab === 'ventas' || manualAbierto || verPedidoId != null) && (
          <div style={{ display: tab === 'ventas' ? 'contents' : 'none' }}>
            {manualAbierto ? (
              // Todo el alto disponible del panel, no una fracción fija. Con
              // `70vh` había que bajar DOS veces —dentro del iframe y dentro del
              // panel— y la barra de SIGUIENTE del CRM, que es la que hace
              // avanzar los 4 pasos, se quedaba fuera de vista. El `minHeight`
              // queda de red por si el 100% no resolviera: nunca invisible.
              <div style={{ height:'100%', minHeight:380 }}>
                <PedidoManual
                  telefono={activeConv.telefono}
                  nombre={contactName}
                  onCerrar={() => setManualAbierto(false)}
                  onCreado={(aviso) => {
                    // Deja la nota fechada con el link y marca la venta. El texto
                    // lo arma `textoNotaPedido` porque el monto y el link son
                    // opcionales y la nota no se puede editar después
                    // (ver lib/pedido-manual).
                    addNota(activeConv.telefono, textoNotaPedido(aviso))
                      .then(() => setNotasRefrescar(n => n + 1))
                      .catch(() => {})
                    setIdVenta(activeConv.telefono, aviso.pedidoId).catch(() => {})
                    setPedidoRes({ ok: true, pedidoId: aviso.pedidoId, montoTotal: aviso.montoTotal, url: aviso.url })
                    // Cerrar el formulario: el aviso "✅ Pedido creado" se pinta
                    // DEBAJO del iframe y, si no, hay que bajar para verlo —
                    // parecería que apretaste y no pasó nada.
                    setManualAbierto(false)
                  }}
                />
              </div>
            ) : verPedidoId != null ? (
              // Mismo hueco y mismo alto que el formulario. El `key` es lo que
              // hace que tocar "Ver" en OTRO pedido remonte el componente: sin
              // él, `MarcoCRM` se queda con la url que congeló al montar y
              // seguirías viendo el pedido anterior.
              <div style={{ height:'100%', minHeight:380 }}>
                <VerPedido
                  key={verPedidoId}
                  pedidoId={verPedidoId}
                  onCerrar={() => setVerPedidoId(null)}
                  /* La hoja del pedido, hecha foto por el CRM, sale al chat
                     abierto. El envío es el de siempre (el mismo de las fotos
                     del 📎 y de la Tienda): acá solo se pasa el camino. */
                  onEnviarHoja={onEnviarHojaPedido}
                />
              </div>
            ) : (
            <div style={{ padding:'12px 12px 4px' }}>
              {/* PEDIDO MANUAL, el ÚNICO camino para crear un pedido: abre la
                  pantalla real de pedidos del CRM acá dentro, precargada con el
                  teléfono y el nombre del chat. El pedido queda firmado por la
                  persona que lo hizo, no por un fantasma. */}
              <button onClick={() => setManualAbierto(true)}
                style={{ ...btnBase, width:'100%', padding:'9px', background:'linear-gradient(135deg,#10b981,#059669)', border:'1px solid rgba(16,185,129,.4)', color:'#fff', borderRadius:8, fontSize:12, fontWeight:800, letterSpacing:'.03em' }}>
                🧾 PEDIDO MANUAL
              </button>
            </div>
            )}

            {/* El resultado del pedido va FUERA del ternario a propósito: el
                formulario se cierra solo al crear el pedido (`setManualAbierto(false)`
                dentro de `onCreado`), así que el aviso "✅ Pedido creado" se
                pinta acá, en la rama de los botones. Metido adentro del ternario
                no se vería NUNCA. Va detrás de `pedidoRes &&` para no dejar un
                div vacío con relleno debajo del iframe: esos 4px de más metían
                una barra de desplazamiento en el panel sin nada que mostrar. */}
            {pedidoRes && (
            <div style={{ padding:'0 12px 4px' }}>
              {pedidoRes?.ok && (
                <div style={{ marginTop:8, padding:'9px 10px', background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#10b981' }}>✅ Pedido creado: {pedidoRes.pedidoId}</div>
                  {/* `diasCalculado` lo mandaba solo el camino con IA, que ya no
                      existe: hoy nunca viene. Las guardas se quedan —sin ellas la
                      línea salía "Total $undefined · undefined días"— por si el
                      CRM algún día manda el dato. */}
                  <div style={{ fontSize:11, color:C.creamDim, marginTop:2 }}>Total ${pedidoRes.montoTotal ?? '—'}{pedidoRes.diasCalculado ? ` · ${pedidoRes.diasCalculado} días` : ''}</div>
                  {/* Abre el pedido recién creado ACÁ MISMO, igual que el "Ver →"
                      del historial: antes se iba a una pestaña nueva y te sacaba
                      del chat. Alcanza con el número (la url la arma
                      `urlVerPedido`), y el número siempre viene — es lo único que
                      `leerAvisoPedido` exige. */}
                  {pedidoRes.pedidoId && (
                    <button onClick={() => setVerPedidoId(pedidoRes.pedidoId)}
                      style={{ display:'inline-block', marginTop:6, padding:'5px 10px', background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.35)', color:'#10b981', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>📄 Ver pedido</button>
                  )}
                </div>
              )}

              {/* Los dos avisos de error de acá abajo eran del camino con IA:
                  `faltan`/`sugerencia` y el `error` los devolvía el agente. Hoy
                  nadie pone `pedidoRes` en `ok:false`, así que no se pintan.
                  Se dejan a propósito: viven DENTRO del mismo envoltorio que el
                  aviso "✅ Pedido creado" y no vale la pena tocar ese bloque por
                  un ahorro cosmético. Si el manual algún día reporta un fallo,
                  la pantalla ya está hecha. */}
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
            )}

            {/* Con el manual abierto, la pestaña Ventas es EL FORMULARIO Y NADA
                MÁS: notas e historial se esconden. Le robaban alto al iframe y
                el síntoma concreto era que la barra de SIGUIENTE del CRM —la que
                hace avanzar los 4 pasos— quedaba fuera de vista.
                ESCONDER y no desmontar, igual que con las pestañas, y acá con un
                motivo extra: <Notas/> tiene su propio estado y su contador de
                refresco, y `onCreado` dispara `addNota` + `setNotasRefrescar`
                justo cuando el pedido se crea. Desmontado en ese momento, la
                nota 📦 recién hecha podía no aparecer al cerrar el formulario.
                El aviso "✅ Pedido creado" queda FUERA de este envoltorio: esa
                confirmación se tiene que ver siempre.

                Con VER PEDIDO abierto se esconden los mismos dos bloques, y por
                el mismo motivo de alto: el iframe pide el 100% del panel y todo
                lo que quede debajo obliga a bajar DOS veces, una dentro del
                pedido y otra dentro del panel. Lo que NO se esconde con esta
                vista es la cabecera del contacto (el bloque de más arriba): con
                el formulario se esconde para ganar alto y para sacar de la vista
                el ✏️ del alias, que era lo único capaz de recargar el iframe;
                mirando un pedido no hay nada que recargar —la url se arma con el
                número, no con el nombre— y saber de quién es el chat que tienes
                abierto mientras lees su pedido vale más que esos 90 px. */}
            <div style={{ display: (manualAbierto || verPedidoId != null) ? 'none' : 'contents' }}>

            {/* LINK PAGO — arma el link dLocal y el texto listo para copiar.
                A propósito NO manda nada al chat: el vendedor lo copia y decide
                cuándo y cómo mandarlo. Portado desde MANDI el 15-ago-2026
                (decisión explícita del dueño: IND reutiliza la cuenta dLocal de
                MANDI, con su propio texto y su propio `description` — ver
                lib/dlocal.js). */}
            <div style={{ padding:'10px 12px', borderTop:`1px solid ${C.border}`, marginTop:8, background:C.bg }}>
              <p style={{ fontSize:10, color:'#10b981', fontWeight:700, letterSpacing:'.08em', margin:'0 0 6px' }}>
                💳 LINK PAGO
              </p>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={montoLink}
                  onChange={e => setMontoLink(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') generarLink() }}
                  placeholder="Monto en $"
                  style={{ flex:1, minWidth:0, background:C.bg, border:`1px solid ${C.border}`, borderRadius:7, color:C.cream, fontSize:11, padding:'6px 8px', outline:'none', fontFamily:'inherit' }}
                />
                <button
                  onClick={generarLink}
                  disabled={!montoLink || generandoLink}
                  style={{
                    flexShrink:0, padding:'6px 14px',
                    background: generandoLink ? C.bg : 'linear-gradient(135deg,#10b981,#059669)',
                    border:'1px solid rgba(16,185,129,.4)', color:'#fff', borderRadius:7,
                    fontSize:11, fontWeight:800, fontFamily:'inherit',
                    cursor: !montoLink || generandoLink ? 'default' : 'pointer',
                    opacity: !montoLink && !generandoLink ? .5 : 1,
                  }}>
                  {generandoLink ? '⏳ Generando...' : 'Generar'}
                </button>
              </div>

              {/* El error se pinta EN PANTALLA, nunca en un title: un title es
                  invisible en celular y ese bug ya costó 17 días de un
                  teléfono que no sonaba (ver aviso de sesión de IND). */}
              {linkPagoError && (
                <div style={{ marginTop:6, fontSize:11, color:'#f87171' }}>⚠️ {linkPagoError}</div>
              )}
            </div>

            {/* NOTAS — varias por chat, cada una con su fecha */}
            <div style={{ padding:'10px 12px', borderTop:`1px solid ${C.border}`, marginTop:8, background:C.bg }}>
              <p style={{ fontSize:10, color:'#f59e0b', fontWeight:700, letterSpacing:'.08em', marginBottom:6 }}>
                📝 NOTAS
              </p>
              {/* El "📄 Ver pedido" de una nota abre el pedido acá mismo, por
                  el MISMO camino que el "Ver →" del historial: antes era un
                  enlace y te sacaba del inbox a otra pestaña. */}
              <Notas telefono={activeConv.telefono} refrescar={notasRefrescar} onVerPedido={setVerPedidoId} />
            </div>

            {/* HISTORIAL DE PEDIDOS */}
            <div style={{ padding:'10px 12px 16px', borderTop:`1px solid ${C.border}`, background:C.bg }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <p style={{ fontSize:10, color:'#60a5fa', fontWeight:700, letterSpacing:'.08em', margin:0, display:'flex', alignItems:'center', gap:6 }}>
                  📦 HISTORIAL DE PEDIDOS
                  {historial?.totalPedidos > 0 && (historial.totalPedidos >= 3 || historial.totalGastado >= 80) && (
                    <span style={{ fontSize:8, background:'rgba(245,158,11,.15)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.35)', borderRadius:10, padding:'1px 6px', fontWeight:800 }}>⭐ VIP</span>
                  )}
                </p>
                <span onClick={() => loadHistorial(activeConv.telefono, contactInfo?.idVenta)} title="Recargar historial"
                  style={{ marginLeft:'auto', color:C.creamDim, fontSize:12, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>🔄</span>
              </div>

              <div style={{ marginTop:8 }}>
                {historial === null && !histError ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[0, 1].map(i => (
                      <div key={i} style={{ height:38, borderRadius:8, background:C.surface2, border:`1px solid ${C.border2}`, opacity:.6 }} />
                    ))}
                  </div>
                ) : histError ? (
                  <div style={{ fontSize:11, color:C.creamDim, padding:'4px 0' }}>
                    No se pudo cargar el historial.{' '}
                    <button onClick={() => loadHistorial(activeConv.telefono, contactInfo?.idVenta)}
                      style={{ background:'transparent', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:11, padding:0, textDecoration:'underline', fontFamily:'inherit' }}>Reintentar</button>
                  </div>
                ) : !historial || historial.totalPedidos === 0 ? (
                  <div style={{ fontSize:11, color:C.creamDim, padding:'7px 9px', background:'rgba(96,165,250,.06)', border:'1px solid rgba(96,165,250,.18)', borderRadius:7 }}>
                    Cliente nuevo ✨ — sin pedidos previos
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:11, color:C.creamDim, marginBottom:7 }}>
                      {historial.totalPedidos} pedido{historial.totalPedidos === 1 ? '' : 's'} · <strong style={{ color:'#10b981' }}>${historial.totalGastado.toFixed(2)}</strong> total
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {historial.pedidos.map(p => <PedidoCard key={p.id} p={p} onVer={setVerPedidoId} />)}
                    </div>
                  </>
                )}
              </div>
            </div>

            </div>{/* fin del envoltorio que se esconde con el manual abierto */}
          </div>
        )}

        {/* ═══════════ TIENDA: CATÁLOGO SHOPIFY (INDSTORE) ═══════════ */}
        {tab === 'tienda' && (
          <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
            {/* Selector de fuente + buscador */}
            <div style={{ position:'sticky', top:0, zIndex:2, padding:'10px 12px', background:C.surface, borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                {[{ id:'shopify', label:CATALOGO_LABEL, icon:'🛍️' }, { id:'sucursal', label:'Sucursal', icon:'🏬' }].map(f => {
                  const on = fuente === f.id
                  return (
                    <button key={f.id} onClick={() => setFuente(f.id)}
                      style={{ flex:1, padding:'6px 8px', borderRadius:8, fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                        border:`1px solid ${on ? 'rgba(244,241,236,.5)' : C.border}`,
                        background: on ? 'rgba(244,241,236,.1)' : 'transparent',
                        color: on ? C.cream : C.creamFaint, transition:'all .15s' }}>
                      {f.icon} {f.label}
                    </button>
                  )
                })}
              </div>
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
                  <span onClick={() => setProdCache(prev => { const n = { ...prev }; delete n[fuente]; return n })} title="Recargar catálogo" style={{ marginLeft:'auto', color:C.creamFaint, fontSize:12, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>🔄</span>
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
                    sending={prodSending[p.id] || null}
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
