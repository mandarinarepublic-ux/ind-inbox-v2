'use client'
import { useState } from 'react'
import { colorFor, initialsFor, fmtTime, parseDate, hashWamid } from '@/lib/utils'

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
export function ContactRow({ conv, isActive, onClick, search = '', estado, modoIA, temp = '', alerta = false, msgSnippet = null }) {
  const [hovered, setHovered] = useState(false)
  const searching = String(search || '').trim().length > 0
  const info = ESTADO_INFO[estado] || null
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
            </div>
            <div style={{ fontSize: 12, color: C.creamDim, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
              💬 {highlight(msgSnippet, search)}
            </div>
          </div>
        ) : searching ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: C.creamDim, whiteSpace: 'nowrap' }}>📱 {highlight('+' + conv.telefono, search)}</span>
            {info && <span style={{ fontSize: 9, fontWeight: 800, color: info.color, background: `${info.color}1e`, border: `1px solid ${info.color}44`, borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{info.label}</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
            <span style={{
              fontSize: 12,
              color: conv.unread > 0 ? C.creamDim : C.creamFaint,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 175, fontWeight: conv.unread > 0 ? 600 : 400,
            }}>
              {conv.last?.direccion === 'SALIENTE' ? 'Tú: ' : ''}
              {conv.last?.mensaje}
            </span>
            {conv.unread > 0 && (
              <span style={{
                background: C.cream, color: C.bg,
                borderRadius: 10, fontSize: 11, fontWeight: 800,
                padding: '1px 7px', marginLeft: 6, flexShrink: 0,
              }}>{conv.unread}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MEDIA CONTENT ────────────────────────────────────────────────
function MediaContent({ tipo, mediaUrl, mediaId }) {
  const raw = mediaUrl || ''
  const driveFixed = raw.includes('drive.google.com/uc') ? raw.replace('export=download', 'export=view') : raw
  const src = viaProxy(driveFixed, mediaId)   // Meta→/api/media ; Drive/otros→igual
  const hasSrc = !!src
  const isImage    = ['image', 'sticker', 'imagen', 'foto'].includes(tipo) || !!raw.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
  const isAudio    = ['audio'].includes(tipo) || !!raw.match(/\.(ogg|mp3|aac|m4a|opus)(\?|$)/i)
  const isVideo    = ['video'].includes(tipo) || !!raw.match(/\.(mp4|mov|webm)(\?|$)/i)
  const isDocument = ['document', 'documento'].includes(tipo) || !!raw.match(/\.(pdf|doc|docx|xls|xlsx)(\?|$)/i)

  if (hasSrc && isImage) return (
    <a href={src} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 6 }}>
      <img src={src} alt="imagen" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', objectFit: 'cover', border: `1px solid ${C.border2}` }} onError={e => { e.currentTarget.style.display = 'none' }} />
    </a>
  )
  if (hasSrc && isAudio) return (
    <a href={src} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: `rgba(244,241,236,.06)`, border: `1px solid rgba(244,241,236,.15)`, borderRadius: 10, padding: '10px 14px', textDecoration: 'none' }}>
      <span style={{ fontSize: 22 }}>🎵</span>
      <span style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Escuchar audio</span>
    </a>
  )
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
function QuotedMessage({ contextoId, allMsgs }) {
  if (!contextoId || !allMsgs) return null
  if (!contextoId.startsWith('wamid.')) return null
  // Comparar por HASH del wamid (el envoltorio difiere aunque sea el mismo mensaje)
  const cited = allMsgs.find(m => hashWamid(m.id) === hashWamid(contextoId))
  if (!cited) return null
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
export function MessageBubble({ msg, allMsgs }) {
  const isMe     = msg.direccion === 'SALIENTE'
  const hasMedia = !!msg.mediaUrl || !!msg.mediaId
  const hasText  = !!msg.mensaje

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 4, animation: 'up .2s ease' }}>
      <div style={{
        maxWidth: '68%',
        background: isMe ? '#1A1A1A' : '#111111',
        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '10px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,.5)',
        border: isMe ? `1px solid rgba(244,241,236,.12)` : `1px solid ${C.border}`,
      }}>
        {msg.referral && <ReferralCard referral={msg.referral} />}
        {msg.contextoId && <QuotedMessage contextoId={msg.contextoId} allMsgs={allMsgs} />}
        {hasMedia && <MediaContent tipo={msg.tipo} mediaUrl={msg.mediaUrl} mediaId={msg.mediaId} />}
        {hasText && <p style={{ margin: 0, fontSize: 14, color: C.cream, lineHeight: 1.55, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.mensaje}</p>}
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
      </div>
    </div>
  )
}

// ── TOAST ─────────────────────────────────────────────────────────
export function Toast({ result }) {
  if (!result) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, animation: 'up .2s ease' }}>
      <span style={{
        fontSize: 12, padding: '5px 16px', borderRadius: 20,
        background: result.ok ? 'rgba(244,241,236,.08)' : 'rgba(239,68,68,.1)',
        color: result.ok ? C.cream : '#f87171',
        border: `1px solid ${result.ok ? 'rgba(244,241,236,.2)' : 'rgba(239,68,68,.2)'}`,
      }}>
        {result.ok ? '✓ Enviado' : '✗ No se pudo enviar — reintenta'}
      </span>
    </div>
  )
}
