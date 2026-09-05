'use client'
import { useState, useEffect } from 'react'
import { colorFor, initialsFor, fmtTime, parseDate, hashWamid } from '@/lib/utils'
import { partirEnlaces } from '@/lib/enlaces'
import { resumenDeLista } from '@/lib/resumen-lista'

// URLs de Meta (WhatsApp) exigen el token en la cabecera → se sirven por /api/media.
// Drive y demás pasan sin cambios.
const esMeta = (u) => /lookaside\.fbsbx\.com|fbcdn\.net|whatsapp\.net|graph\.facebook\.com/i.test(String(u || ''))
function viaProxy(url, mediaId) {
  if (url && esMeta(url)) return `/api/media?url=${encodeURIComponent(url)}`
  if (!url && mediaId)    return `/api/media?id=${encodeURIComponent(mediaId)}`
  return url
}

// Paleta IND
const C = {
  bg:        '#0A0A0A',
  surface:   '#111111',
  surface2:  '#161616',
  border:    '#1F1F1F',
  border2:   '#2A2A2A',
  cream:     '#F4F1EC',
  creamDim:  '#A09A90',
  creamFaint:'#3A3530',
  accent:    '#F4F1EC',  // crema como acento principal
}

// ── SPINNER ──────────────────────────────────────────────────────
export function Spinner({ size = 24 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `${size * 0.125}px solid ${C.border2}`,
      borderTop: `${size * 0.125}px solid ${C.cream}`,
      borderRadius: '50%',
      animation: 'spin .7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ── AVATAR ───────────────────────────────────────────────────────
export function Avatar({ name, phone, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colorFor(phone),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, color: '#fff', flexShrink: 0,
      letterSpacing: '0.03em', userSelect: 'none',
    }}>
      {initialsFor(name)}
    </div>
  )
}

// ── STATUS PILL ──────────────────────────────────────────────────
export function StatusPill({ estado }) {
  const map = {
    recibido: { bg: 'rgba(239,68,68,.13)',   color: '#f87171', label: 'Sin leer' },
    leido:    { bg: 'rgba(160,154,144,.11)', color: '#A09A90', label: 'Leído'    },
    enviado:  { bg: 'rgba(244,241,236,.08)', color: '#F4F1EC', label: 'Enviado'  },
    error:    { bg: 'rgba(239,68,68,.16)',   color: '#f87171', label: 'Error'    },
  }
  const s = map[estado] || map.leido
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 20, background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

// Read receipts estilo WhatsApp para mensajes SALIENTES.
// sent → ✓ gris · delivered → ✓✓ gris · read → ✓✓ azul · failed → ⚠ rojo.
export function Ticks({ estado }) {
  if (estado === 'failed') {
    return <span title="No se pudo entregar" style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>⚠</span>
  }
  const doble = estado === 'read' || estado === 'delivered'
  const azul  = estado === 'read'
  const label = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído' }[estado] || 'Enviado'
  return (
    <span title={label} style={{
      fontSize: 13, lineHeight: 1, letterSpacing: '-3px', paddingRight: 2,
      color: azul ? '#53bdeb' : '#8aa0b3', fontWeight: 700,
    }}>{doble ? '✓✓' : '✓'}</span>
  )
}

// ── CONTACT ROW ──────────────────────────────────────────────────
// Resalta coincidencias de búsqueda
function highlight(text, query) {
  const t = String(text ?? '')
  const q = String(query || '').trim().toLowerCase()
  if (!q) return t
  const lt = t.toLowerCase(); const parts = []; let last = 0, idx, key = 0
  while ((idx = lt.indexOf(q, last)) !== -1) {
    if (idx > last) parts.push(t.slice(last, idx))
    parts.push(<mark key={key++} style={{ background:'#60a5fa33', color:'#93c5fd', borderRadius:3, padding:'0 1px' }}>{t.slice(idx, idx + q.length)}</mark>)
    last = idx + q.length
  }
  if (last < t.length) parts.push(t.slice(last))
  return parts.length ? parts : t
}
const ESTADO_INFO = {
  pendiente:    { label:'Pendiente',  color:'#f87171' },
  atendido:     { label:'Atendido',   color:'#4ade80' },
  ventaproceso: { label:'En proceso', color:'#f59e0b' },
  venta:        { label:'Venta',      color:'#10b981' },
  soporte:      { label:'Soporte',    color:'#a78bfa' },
  archivado:    { label:'Archivado',  color:'#64748b' },
}

// ── MINI-BURBUJA IA / HUMANO ─────────────────────────────────────
// Indica de un vistazo quién atiende el chat: la IA (🤖 amarillo) o un
// humano (🧑 verde, IA apagada). modoIA: true = IA, false = HUMANO.
function IABadge({ modoIA }) {
  const ia = modoIA !== false // undefined/true → IA prendida por defecto
  const c  = ia ? '#f59e0b' : '#25d366' // IA = amarillo, HUMANO = verde
  return (
    <span
      title={ia ? 'IA atendiendo' : 'Atiende un humano'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        fontSize: 9, fontWeight: 800, letterSpacing: '.04em', lineHeight: 1,
        color: c, background: `${c}1e`, border: `1px solid ${c}55`,
        borderRadius: 20, padding: '2px 6px',
      }}
    >
      {ia ? '🤖 IA' : '🧑 TÚ'}
    </span>
  )
}

const TEMP_ICON = { caliente: '🔥', tibio: '🌤️', frio: '❄️' }
// Etiqueta de a qué número (3326 / 9804) pertenece un resultado del buscador.
// Solo se pinta buscando: el dueño lo pidió explícito — "el buscador debe
// señalarme dónde está". Cuando es de OTRO canal (no el de la pestaña activa)
// se resalta distinto: pulsarlo va a cambiar de pestaña, y eso hay que verlo venir.
function CanalBadge({ label, distinto }) {
  if (!label) return null
  const color = distinto ? '#fbbf24' : C.creamFaint
  return (
    <span
      title={distinto ? `Este chat está en el número ${label} — al abrirlo se cambia de pestaña` : `Número ${label}`}
      style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '.02em', flexShrink: 0,
        color, background: distinto ? 'rgba(251,191,36,.14)' : 'rgba(244,241,236,.06)',
        border: `1px solid ${distinto ? 'rgba(251,191,36,.4)' : C.border2}`,
        borderRadius: 6, padding: '1px 6px',
      }}
    >
      {distinto ? '↗ ' : '📶 '}{label}
    </span>
  )
}
export function ContactRow({ conv, isActive, onClick, search = '', estado, modoIA, temp = '', alerta = false, msgSnippet = null, canalLabel = null, canalDistinto = false }) {
  const [hovered, setHovered] = useState(false)
  const searching = String(search || '').trim().length > 0
  const info = ESTADO_INFO[estado] || null
  // ── DE QUE ANUNCIO VINO ────────────────────────────────────────
  // 816 conversaciones al mes arrancan con el mismo texto y en la bandeja se ven
  // todas iguales. Esta linea dice de que vino la persona; la de abajo, que acaba
  // de decir. Las dos hacen falta: una para saber de que te habla, otra para
  // saber que contestar.
  //
  // Sale de la CONVERSACION (conv.origenAnuncio), no del ultimo mensaje: cuando
  // un chat espera respuesta el ultimo suele ser un seguimiento y el anuncio
  // quedo en el primero.
  //
  // La fila tiene TRES ramas y el origen sale en las tres. En la lista normal se
  // pide ademas que el chat ESPERE respuesta, para no subirle el alto a toda la
  // bandeja; buscando eso no aplica: son pocas filas y lo que se quiere es
  // justamente saber de donde salio esa persona.
  //
  // Sin origen NO se pinta nada: un cliente del que no sabemos de donde vino
  // tiene que NOTARSE, no disfrazarse con una suposicion.
  const mostrarOrigen = !!conv.origenAnuncio &&
    (searching || msgSnippet != null || conv.last?.direccion === 'ENTRANTE')
  const LineaOrigen = () => (
    <div style={{
      fontSize: 11, color: C.cream, marginTop: 3,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190,
    }} title={conv.origenAnuncio}>🎯 {conv.origenAnuncio}</div>
  )
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px', cursor: 'pointer', transition: 'all .12s',
        background: isActive
          ? `rgba(244,241,236,.06)`
          : hovered ? 'rgba(255,255,255,.02)' : 'transparent',
        borderLeft: isActive ? `3px solid ${C.cream}` : '3px solid transparent',
      }}
    >
      <Avatar name={conv.nombre} phone={conv.telefono} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{highlight(conv.nombre, search)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {alerta && <span title="🔥 Caliente — cerca de cerrar la ventana de 24h" style={{ fontSize: 12, animation: 'pulse 2s infinite' }}>⏰</span>}
            {temp && TEMP_ICON[temp] && <span title={`Lead ${temp}`} style={{ fontSize: 12 }}>{TEMP_ICON[temp]}</span>}
            <IABadge modoIA={modoIA} />
            <span style={{ fontSize: 11, color: C.creamFaint }}>{fmtTime(conv.last?.timestamp)}</span>
          </div>
        </div>
        {msgSnippet != null ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: C.creamFaint, fontFamily: 'monospace' }}>+{conv.telefono}</span>
              {info && <span style={{ fontSize: 9, fontWeight: 800, color: info.color, background: `${info.color}1e`, border: `1px solid ${info.color}44`, borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{info.label}</span>}
              <CanalBadge label={canalLabel} distinto={canalDistinto} />
            </div>
            {mostrarOrigen && <LineaOrigen />}
            <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
              💬 {highlight(msgSnippet, search)}
            </div>
          </div>
        ) : searching ? (
          <>
          {mostrarOrigen && <LineaOrigen />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: C.creamDim, whiteSpace: 'nowrap' }}>📱 {highlight('+' + conv.telefono, search)}</span>
            {info && <span style={{ fontSize: 9, fontWeight: 800, color: info.color, background: `${info.color}1e`, border: `1px solid ${info.color}44`, borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{info.label}</span>}
            <CanalBadge label={canalLabel} distinto={canalDistinto} />
          </div>
          </>
        ) : (
          <>
          {mostrarOrigen && <LineaOrigen />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
            <span style={{
              fontSize: 12,
              color: conv.unread > 0 ? C.creamDim : C.creamFaint,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 175, fontWeight: conv.unread > 0 ? 600 : 400,
            }}>
              {conv.last?.direccion === 'SALIENTE' ? 'Tú: ' : ''}
              {/* Una ubicación acá se veía como "📍 -0.18640510737896,-78.4934…":
                  ocupaba la fila entera sin decir nada. La vista de la lista no
                  trae `raw`, pero parseUbicacion igual saca el nombre del texto
                  cuando el cliente escogió un sitio guardado. */}
              {/* 816 conversaciones al mes arrancan con EXACTAMENTE el mismo texto
                  ("¡Hola! Quiero más información.", el que arma Meta al tocar un
                  anuncio) y en la lista se veían todas iguales. `resumenDeLista`
                  saca de qué anuncio o de qué producto viene. Solo en ENTRANTES:
                  al contestar vuelve a mandar el último mensaje. */}
              {(() => {
                const r = resumenDeLista(conv.last)
                if (r) return `${r.icono} ${r.texto}`
                if (conv.last?.ubicacion) return `📍 ${conv.last.ubicacion.nombre || 'Ubicación'}`
                return conv.last?.mensaje
              })()}
            </span>
            {conv.unread > 0 && (
              <span style={{
                background: C.cream, color: C.bg,
                borderRadius: 10, fontSize: 11, fontWeight: 800,
                padding: '1px 7px', marginLeft: 6, flexShrink: 0,
              }}>{conv.unread}</span>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── MEDIA CONTENT ────────────────────────────────────────────────
// ── VISOR DE FOTO ────────────────────────────────────────────────
/**
 * Ver una foto del chat en grande, SIN salir del inbox.
 *
 * Antes la foto era un <a target="_blank">: cada una abría una pestaña nueva y
 * había que cerrarla con la X del navegador y volver al chat. Con 25 chats al
 * día eso son 25 pestañas y 50 clics.
 *
 * Cierra con CUALQUIER clic —incluido sobre la propia foto— y con Escape. Es
 * deliberado: acá no hay zoom ni nada que hacer sobre la imagen, así que pedir
 * puntería sobre el fondo o sobre una X sería fricción sin motivo.
 */
function VisorFoto({ src, onCerrar }) {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada — toca en cualquier lado para cerrar"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, cursor: 'zoom-out', animation: 'up .15s ease',
      }}
    >
      <img src={src} alt="Foto ampliada" style={{
        maxWidth: '92vw', maxHeight: '90vh',
        objectFit: 'contain', borderRadius: 6, display: 'block',
      }} />

      {/* La X no hace falta para cerrar (cualquier clic cierra), pero se deja
          visible: sin ninguna señal, una pantalla negra no se ve "cerrable". */}
      <button onClick={onCerrar} aria-label="Cerrar" style={{
        position: 'fixed', top: 16, right: 20,
        background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8,
        color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer',
        padding: '8px 12px', fontFamily: 'inherit',
      }}>✕</button>

      {/* Abrir aparte sigue disponible para descargar o ver al 100%. Frena el
          clic para que el enlace no se coma su propio cierre. */}
      <a href={src} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,.1)', borderRadius: 8,
          color: '#fff', fontSize: 12, textDecoration: 'none',
          padding: '8px 14px', fontWeight: 600,
        }}>Abrir en pestaña ↗</a>
    </div>
  )
}

function MediaContent({ tipo, mediaUrl, mediaId }) {
  // Va ANTES de cualquier return condicional: los hooks no pueden quedar
  // detrás de un if.
  const [verFoto, setVerFoto] = useState(false)
  const raw = mediaUrl || ''
  const driveFixed = raw.includes('drive.google.com/uc') ? raw.replace('export=download', 'export=view') : raw
  const src = viaProxy(driveFixed, mediaId)   // Meta→/api/media ; Drive/otros→igual
  const hasSrc = !!src
  const isImage    = ['image', 'sticker', 'imagen', 'foto'].includes(tipo) || !!raw.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
  const isAudio    = ['audio'].includes(tipo) || !!raw.match(/\.(ogg|mp3|aac|m4a|opus)(\?|$)/i)
  const isVideo    = ['video'].includes(tipo) || !!raw.match(/\.(mp4|mov|webm)(\?|$)/i)
  const isDocument = ['document', 'documento'].includes(tipo) || !!raw.match(/\.(pdf|doc|docx|xls|xlsx)(\?|$)/i)

  if (hasSrc && isImage) return (
    <>
      {/* La foto ya no es un enlace: abre el visor de acá arriba, sin sacar a
          nadie del inbox. `img` sigue estando en la lista que ignora `alTocar`
          de la burbuja, así que tocarla no dispara "responder". */}
      <img src={src} alt="Foto — toca para verla en grande" title="Toca para ver en grande"
        onClick={() => setVerFoto(true)}
        style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', objectFit: 'cover', marginBottom: 6, border: `1px solid ${C.border2}`, cursor: 'zoom-in' }}
        onError={e => { e.currentTarget.style.display = 'none' }} />
      {verFoto && <VisorFoto src={src} onCerrar={() => setVerFoto(false)} />}
    </>
  )
  if (hasSrc && isAudio) {
    // Google Drive no deja hacer streaming inline → cae al link "Escuchar audio".
    const isDrive = raw.includes('drive.google.com')
    if (isDrive) return (
      <a href={src} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: `rgba(244,241,236,.06)`, border: `1px solid rgba(244,241,236,.15)`, borderRadius: 10, padding: '10px 14px', textDecoration: 'none' }}>
        <span style={{ fontSize: 22 }}>🎵</span>
        <span style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Escuchar audio</span>
      </a>
    )
    return (
      <div style={{ marginBottom: 6, minWidth: 280 }}>
        <audio controls preload="metadata" src={src} style={{ width: '100%', minWidth: 280, height: 40, display: 'block', borderRadius: 10, outline: 'none', accentColor: C.cream }} />
        {/* Respaldo: si el reproductor inline falla (caché/navegador), este link
            abre el audio en pestaña nueva, donde siempre suena. */}
        <a href={src} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: C.cream, textDecoration: 'none', fontWeight: 600 }}>
          🎧 Abrir audio ↗
        </a>
      </div>
    )
  }
  if (hasSrc && isVideo) return (
    <div style={{ marginBottom: 6, maxWidth: '100%' }}>
      <video controls preload="metadata" src={src} style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', border: `1px solid ${C.border2}` }} />
      {/* Respaldo: si el reproductor inline falla, abre el video en pestaña nueva. */}
      <a href={src} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: C.cream, textDecoration: 'none', fontWeight: 600 }}>
        🎬 Abrir video ↗
      </a>
    </div>
  )
  if (hasSrc && isDocument) return (
    <a href={src} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: `rgba(244,241,236,.06)`, border: `1px solid rgba(244,241,236,.15)`, borderRadius: 10, padding: '10px 14px', textDecoration: 'none' }}>
      <span style={{ fontSize: 22 }}>📄</span>
      <span style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Documento adjunto</span>
    </a>
  )
  if (hasSrc && tipo && !['text', 'texto', 'reaction'].includes(tipo)) return (
    <a href={src} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: `rgba(244,241,236,.06)`, border: `1px solid rgba(244,241,236,.15)`, borderRadius: 10, padding: '10px 14px', textDecoration: 'none' }}>
      <span style={{ fontSize: 20 }}>📎</span>
      <span style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Abrir {tipo}</span>
    </a>
  )
  return null
}

// ── QUOTED MESSAGE ────────────────────────────────────────────────
// Si el mensaje citado quedó fuera de lo que hay cargado, se pide por API; y si aun
// así no aparece, se muestra un aviso en vez de NADA (antes desaparecía en silencio
// y parecía que el cliente no había citado nada).
function QuotedMessage({ contextoId, allMsgs, esReaccion = false }) {
  const [fetched, setFetched] = useState(null)
  const valid    = !!contextoId && contextoId.startsWith('wamid.')
  // Comparar por HASH del wamid (el envoltorio difiere aunque sea el mismo mensaje)
  const inWindow = valid && allMsgs ? allMsgs.find(m => hashWamid(m.id) === hashWamid(contextoId)) : null
  const cited    = inWindow || fetched
  const needFetch = valid && !inWindow && !fetched

  useEffect(() => {
    if (!needFetch) return
    let cancel = false
    fetch(`/api/mensaje?id=${encodeURIComponent(contextoId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancel && d && d.id) setFetched(d) })
      .catch(() => {})
    return () => { cancel = true }
  }, [contextoId, needFetch])

  if (!valid) return null

  if (!cited) {
    // Una REACCIÓN cuyo mensaje no tenemos guardado no pinta nada: la burbuja ya
    // dice "❤️ Reaccionó a un mensaje", y encima de eso un "Respondió a un
    // mensaje anterior" sería redundante Y con el verbo equivocado. Pasa sobre
    // todo con reacciones a mensajes anteriores a nuestro historial.
    if (esReaccion) return null
    return (
      <div style={{ borderLeft: `3px solid rgba(244,241,236,.4)`, background: 'rgba(0,0,0,.3)', borderRadius: '0 8px 8px 0', padding: '5px 10px', marginBottom: 6, fontSize: 11, color: C.creamDim, fontStyle: 'italic' }}>
        ↩️ Respondió a un mensaje anterior
      </div>
    )
  }

  const isImage = ['image','sticker','imagen','foto'].includes(cited.tipo) || !!cited.mediaUrl?.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
  const citedSrc = viaProxy(cited.mediaUrl, cited.mediaId)
  return (
    <div style={{ borderLeft: `3px solid rgba(244,241,236,.4)`, background: 'rgba(0,0,0,.3)', borderRadius: '0 8px 8px 0', padding: '5px 10px', marginBottom: 6, overflow: 'hidden' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.cream, marginBottom: 2 }}>
        {cited.direccion === 'SALIENTE' ? 'Tú' : cited.nombre || cited.telefono}
      </div>
      {isImage && citedSrc ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={citedSrc} alt="img citada" style={{ width: 36, height: 36, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} onError={e => { e.currentTarget.style.display = 'none' }} />
          {cited.mensaje && <span style={{ fontSize: 12, color: C.creamDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cited.mensaje}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.creamDim, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {cited.mensaje || `[${cited.tipo || 'media'}]`}
        </div>
      )}
    </div>
  )
}

// ── REFERRAL / PAUTA (anuncio Click-to-WhatsApp) ─────────────────
// Cuando un cliente entra desde un anuncio de Meta, el mensaje trae `referral`
// con el anuncio del que vino. Lo mostramos para responder con contexto.
function ReferralCard({ referral }) {
  let r = referral
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { return null } }
  if (!r || typeof r !== 'object') return null

  const img = r.image_url || r.thumbnail_url || ''
  const proxied = img ? viaProxy(img) : ''
  if (!r.headline && !r.body && !proxied && !r.source_url) return null

  return (
    <div style={{
      border: '1px solid rgba(245,158,11,.35)',
      background: 'rgba(245,158,11,.08)',
      borderRadius: 12, padding: 8, marginBottom: 8,
      display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: '100%',
    }}>
      {proxied && (
        <img
          src={proxied}
          alt="anuncio"
          style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: '.03em', marginBottom: 2 }}>
          📣 VINO DE {r.source_type === 'post' ? 'UNA PUBLICACIÓN' : 'UN ANUNCIO'}
        </div>
        {r.headline && (
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.cream,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{r.headline}</div>
        )}
        {r.body && (
          <div style={{
            fontSize: 12, color: C.creamDim, marginTop: 2,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap',
          }}>{r.body}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.source_url && (
            <a href={r.source_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, textDecoration: 'none' }}>
              Ver anuncio ↗
            </a>
          )}
          {r.source_id && (
            <span style={{ fontSize: 10, color: C.creamFaint }}>ID: {r.source_id}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MESSAGE BUBBLE ────────────────────────────────────────────────
// `onResponder` (opcional): al tocar la burbuja aparece "↩ Responder" SOLO en ese
// mensaje. Nada visible hasta que el usuario toca — a propósito: una flecha fija en
// cada burbuja ensucia el hilo entero.
// ── TEXTO CON ENLACES ─────────────────────────────────────
//
// El chat pintaba el texto plano y una URL llegaba MUERTA: había que copiarla y
// pegarla a mano. Importa porque la web manda clientes por
// `api.whatsapp.com/send?text=…` y ahí va a viajar el link del producto.
//
// ☠️ Solo se enlazan http y https, por lista BLANCA (ver lib/enlaces.js): el
// texto lo escribe el cliente, y un `javascript:` en un href se ejecutaría en la
// sesión de quien atiende, que tiene la cookie del CRM.
//
// El `stopPropagation` es para que tocar un enlace ABRA el enlace y no despliegue
// el "Responder" de la burbuja.
function TextoConEnlaces({ texto }) {
  return partirEnlaces(texto).map((p, i) => (
    p.tipo === 'enlace' ? (
      <a key={i} href={p.href} target="_blank" rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        style={{ color: C.cream, textDecoration: 'underline', wordBreak: 'break-all' }}>
        {p.valor}
      </a>
    ) : p.valor
  ))
}

// ── TARJETA DE PEDIDO DEL CATÁLOGO ────────────────────────
//
// Meta manda SOLO el `product_retailer_id` de cada línea: ni nombre ni foto. El
// chat mostraba "1 × $35.00 (44500256129117)" y no había forma de saber qué se
// había vendido — 20 pedidos ($760) así. El nombre y la foto los resuelve
// lib/catalogo.js y llegan en msg.pedido.
//
// ☠️ Una línea que NO se pudo resolver muestra su id, NO se esconde. Siete ids de
// IND no tienen cómo resolverse todavía (sus catálogos no pertenecen a "Mandarina
// Lab"): si se filtraran, un pedido de 2 artículos se vería como de 1.
function PedidoCard({ pedido }) {
  const money = (n) => `$${Number(n || 0).toFixed(2)}`
  return (
    <div style={{
      background: C.surface2, border: `1px solid ${C.border2}`,
      borderRadius: 12, padding: '9px 11px', minWidth: 210,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.cream, marginBottom: 7 }}>
        📦 Pedido del catálogo
      </div>

      {pedido.items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, alignItems: 'center',
          paddingTop: i ? 7 : 0, marginTop: i ? 7 : 0,
          borderTop: i ? `1px solid ${C.border}` : 'none',
        }}>
          {it.imagen ? (
            <img src={it.imagen} alt="" loading="lazy" style={{
              width: 46, height: 46, borderRadius: 8, objectFit: 'cover',
              flexShrink: 0, background: C.bg,
            }} />
          ) : (
            <div style={{
              width: 46, height: 46, borderRadius: 8, flexShrink: 0,
              background: C.bg, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🛍️</div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, color: C.cream, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
              {it.nombre || 'Producto no identificado'}
            </div>
            <div style={{ fontSize: 11, color: C.creamDim, marginTop: 2 }}>
              {it.cant} × {money(it.precio)}
              {it.color ? ` · ${it.color}` : ''}
              {it.cant > 1 ? ` · ${money(it.total)}` : ''}
            </div>
            {/* Sin nombre, el id es lo ÚNICO que identifica el producto: se
                muestra para que se pueda buscar a mano en el catálogo. */}
            {!it.nombre && (
              <div style={{ fontSize: 10, color: C.creamFaint, marginTop: 1, fontFamily: 'monospace' }}>
                {it.retailerId}
              </div>
            )}
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border2}`,
        display: 'flex', justifyContent: 'space-between', fontSize: 12,
      }}>
        <span style={{ color: C.creamDim }}>
          {pedido.items.length} {pedido.items.length === 1 ? 'artículo' : 'artículos'}
        </span>
        <span style={{ color: C.cream, fontWeight: 700 }}>{money(pedido.total)}</span>
      </div>
      {/* ⚠️ La talla NO viene en el pedido: Meta no la manda y el catálogo la
          trae vacía. Hay que preguntársela al cliente SIEMPRE. */}
      <div style={{ fontSize: 10, color: C.creamFaint, marginTop: 5 }}>
        ⚠️ El pedido no trae la talla — hay que preguntarla
      </div>
    </div>
  )
}

// ── TARJETA DE UBICACIÓN ──────────────────────────────────
//
// WhatsApp guarda la ubicación como texto ("📍 lat,lon nombre") y el chat mostraba
// esas coordenadas pelonas. Acá se pintan como tarjeta clicable que abre Google
// Maps. El objeto lo arma parseUbicacion (lib/wa-mensaje.js) y viaja en
// msg.ubicacion desde toMensaje.
//
// Meta manda `name`/`address` SOLO cuando el cliente escoge un sitio guardado;
// cuando suelta el pin de "ubicación actual" llegan puras coordenadas (27 de 38
// entrantes de IND). Por eso el título cae a "Ubicación compartida" y la segunda
// línea a las coordenadas redondeadas: la tarjeta NUNCA queda vacía.
function UbicacionCard({ u }) {
  const titulo    = u.nombre || 'Ubicación compartida'
  const coords    = `${Number(u.lat).toFixed(5)}, ${Number(u.lon).toFixed(5)}`
  const subtitulo = u.direccion || coords

  return (
    <a href={u.url} target="_blank" rel="noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'block', textDecoration: 'none',
        background: C.surface2, border: `1px solid ${C.border2}`,
        borderRadius: 12, padding: '9px 11px', minWidth: 190,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, lineHeight: 1.2 }}>📍</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, wordBreak: 'break-word', lineHeight: 1.35 }}>{titulo}</div>
          <div style={{ fontSize: 12, color: C.creamDim, marginTop: 2, wordBreak: 'break-word', lineHeight: 1.35 }}>{subtitulo}</div>
          {/* La dirección desplaza las coordenadas: se muestran igual, porque son
              el dato con el que se busca el sitio si el nombre no alcanza. */}
          {u.direccion && (
            <div style={{ fontSize: 11, color: C.creamFaint, marginTop: 1 }}>{coords}</div>
          )}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
            fontSize: 11, fontWeight: 700, color: C.accent, borderBottom: `1px solid ${C.border2}`,
          }}>↗ Abrir en Google Maps</div>
        </div>
      </div>
    </a>
  )
}

export function MessageBubble({ msg, allMsgs, onResponder, onAbrirChat }) {
  const [accion, setAccion] = useState(false)
  const isMe     = msg.direccion === 'SALIENTE'
  const hasMedia = !!msg.mediaUrl || !!msg.mediaId
  const hasText  = !!msg.mensaje

  // Un clic sobre una foto, un link o un botón hace LO SUYO, no abre el "Responder".
  const alTocar = (e) => {
    if (!onResponder) return
    if (e.target.closest('a, button, img, video, audio')) return
    setAccion(v => !v)
  }

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 4, animation: 'up .2s ease' }}>
      <div
        onClick={alTocar}
        title={onResponder ? 'Toca para responder a este mensaje' : undefined}
        style={{
        maxWidth: '68%',
        background: isMe ? '#1A1A1A' : '#111111',
        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '10px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,.5)',
        border: isMe ? `1px solid rgba(244,241,236,.12)` : `1px solid ${C.border}`,
        cursor: onResponder ? 'pointer' : 'default',
      }}>
        {msg.referral && <ReferralCard referral={msg.referral} />}
        {msg.contextoId && <QuotedMessage contextoId={msg.contextoId} allMsgs={allMsgs} esReaccion={msg.tipo === 'reaction'} />}
        {hasMedia && <MediaContent tipo={msg.tipo} mediaUrl={msg.mediaUrl} mediaId={msg.mediaId} />}
        {/* La ubicación reemplaza al texto: el `mensaje` de esa fila SON las
            coordenadas, y la tarjeta ya las muestra. Nunca deja la burbuja
            vacía — si parseUbicacion no reconoce algo, cae al <p> de siempre. */}
        {msg.pedido
          ? <PedidoCard pedido={msg.pedido} />
          : msg.ubicacion
          ? <UbicacionCard u={msg.ubicacion} />
          : hasText && <p style={{ margin: 0, fontSize: 14, color: C.cream, lineHeight: 1.55, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}><TextoConEnlaces texto={msg.mensaje} /></p>}

        {/* ── IR AL CHAT DEL NÚMERO ANTERIOR ────────────────────
            Cuando un cliente se muda de teléfono, su historial queda partido en
            dos chats. Este botón es el puente: lleva al de antes sin recargar la
            página (no es un <a>, es un cambio de conversación en el momento).
            ⚠️ Solo se pinta si onAbrirChat llegó: en cualquier otro lugar donde
            se reuse la burbuja, el mensaje se ve igual pero sin botón muerto. */}
        {msg.numeroAnterior && onAbrirChat && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbrirChat(msg.numeroAnterior) }}
            style={{
              marginTop: 7, padding: '5px 11px', borderRadius: 14,
              background: C.surface2, border: `1px solid ${C.border2}`,
              color: C.cream, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>↗ Revisar conversación en el número anterior</button>
        )}

        {/* Botones interactivos enviados por nosotros */}
        {isMe && msg.botones && (() => {
          try {
            const btns = typeof msg.botones === 'string' ? JSON.parse(msg.botones) : msg.botones
            if (!Array.isArray(btns) || btns.length === 0) return null
            return (
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7 }}>
                {btns.map((btn, i) => (
                  <div key={i} style={{
                    padding:'5px 12px', borderRadius:20,
                    border:'1px solid rgba(245,158,11,.45)',
                    color:'#f59e0b', fontSize:12, fontWeight:600,
                    background:'rgba(245,158,11,.08)',
                  }}>[ {btn.title} ]</div>
                ))}
              </div>
            )
          } catch { return null }
        })()}
        {!hasText && !hasMedia && !msg.botones && <p style={{ margin: 0, fontSize: 13, color: C.creamFaint, fontStyle: 'italic' }}>{msg.tipo ? `[${msg.tipo}]` : '[mensaje]'}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: C.creamFaint }}>
          {(() => {
          const d = parseDate(msg.timestamp)
          const today = new Date()
          const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
          const isToday = d.toDateString() === today.toDateString()
          const isYesterday = d.toDateString() === yesterday.toDateString()
          const timeStr = isNaN(d) ? '' : d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})
          if (isNaN(d)) return ''
          if (isToday) return timeStr
          if (isYesterday) return `Ayer ${timeStr}`
            return `${d.getDate()}${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()]} ${timeStr}`
            })()} 
          </span>
          {isMe && <Ticks estado={msg.estadoEntrega} />}
        </div>

        {/* Aparece SOLO en el mensaje que tocaste. Se va al usarlo o al tocar de nuevo. */}
        {accion && onResponder && (
          <div style={{ display:'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', marginTop: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setAccion(false); onResponder(msg) }}
              style={{
                background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.45)',
                color:'#f59e0b', borderRadius:14, padding:'3px 12px',
                fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
              }}>↩ Responder</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TOAST ─────────────────────────────────────────────────────────
export function Toast({ result }) {
  if (!result) return null
  // Si trae `msg`, se muestra ese texto tal cual (p. ej. "enviado, pero sin la cita").
  const custom = typeof result.msg === 'string' ? result.msg : null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, animation: 'up .2s ease' }}>
      <span style={{
        fontSize: 12, padding: '5px 16px', borderRadius: 20,
        background: result.ok ? 'rgba(244,241,236,.08)' : 'rgba(239,68,68,.1)',
        color: result.ok ? C.cream : '#f87171',
        border: `1px solid ${result.ok ? 'rgba(244,241,236,.2)' : 'rgba(239,68,68,.2)'}`,
      }}>
        {custom ? custom : (result.ok ? '✓ Enviado' : '✗ No se pudo enviar — reintenta')}
      </span>
    </div>
  )
}
