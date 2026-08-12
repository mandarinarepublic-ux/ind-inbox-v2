'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { fetchInboxSync, fetchHilo, buscarEnMensajes, sendReply, sendImageUrl as sendImageUrlApi, updateContact, updateTemperatura, isDemo, sendInteractiveButtons, toggleIAMode, sendVideo, sendImageFile, precacheMedia, setCanalActivo } from '@/lib/api-client'
import { CANALES, CANAL_POR_DEFECTO, canalDePhoneId } from '@/lib/canales'
import { buildConvs, fmtDate, parseDate as _parseDate } from '@/lib/utils'
import { Spinner, Avatar, ContactRow, MessageBubble, Toast } from '@/components/Components'
import RightPanel from '@/components/RightPanel'
import Contactos, { PlantillaModal } from '@/components/Contactos'
import Automatizaciones from '@/components/Automatizaciones'
import PushToggle from '@/components/PushToggle'
import AvisoSesion from '@/components/AvisoSesion'
import { actualizarNoLeidos, notificar } from '@/lib/notif'
import { hayQueConfirmarDescarte, AVISO_DESCARTAR_PEDIDO, anchoPanelPedido, anchoPanelMinimo, bytesDeDataUrl, MAX_HOJA_BYTES } from '@/lib/pedido-manual'
import { decidirArrastre } from '@/lib/arrastre'
import { decidirPegado, decidirAdjuntos, TOPE_FOTOS } from '@/lib/adjuntos'

// ── Ancho del panel derecho: UNA sola fuente ──────────────────────
// Lo usan el asa de arrastre, la restauración de localStorage y el ensanchado
// automático del PEDIDO MANUAL. Tienen que salir del mismo lado: si el máximo
// del asa quedara MENOR que el ancho al que se abre el formulario, el primer
// arrastre devolvería el panel de un salto hacia atrás y se sentiría como que el
// asa "se queda aplastada".
const ANCHO_MIN = 260
const ANCHO_MAX = 680

// Con el formulario abierto el panel mide lo que mide el formulario, ni más ni
// menos: si sobra, el vacío se reparte a los lados y el panel le roba pantalla
// al chat para nada. Y el PISO sube, porque por debajo de cierto ancho el CRM se
// pasa solo a su diseño de celular. Los dos números se DERIVAN de `ESCALA_PEDIDO`
// (ver lib/pedido-manual.js): si alguien toca la escala, se mueven con ella.
const ANCHO_PEDIDO     = anchoPanelPedido()   // hoy 560 → 800 px internos
const ANCHO_MIN_PEDIDO = anchoPanelMinimo()   // hoy 538 → 769 px internos, justo sobre el corte

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

// ── Dos ejes de estado ────────────────────────────────────────────
// Eje 1 (bandeja): pendiente / atendido / soporte / archivado — casi todo automático.
// Eje 2 (temperatura del lead): caliente / tibio / frio — 100% MANUAL, nada la cambia sola.
const TEMPERATURAS = [
  { key:'caliente', icon:'🔥', label:'Caliente', color:'#f97316' },
  { key:'tibio',    icon:'🌤️', label:'Tibio',    color:'#fbbf24' },
  { key:'frio',     icon:'❄️', label:'Frío',     color:'#38bdf8' },
]
const TEMP_META = Object.fromEntries(TEMPERATURAS.map(t => [t.key, t]))

// La ventana de 24h de Meta arranca en el ÚLTIMO mensaje del cliente. Un lead 🔥 caliente
// que se acerca a las 24h de silencio se resalta con ⏰ (hay que cerrarlo antes de que Meta
// bloquee el mensaje gratis). Umbral por defecto: 20h.
const VENTANA_MS = 24 * 60 * 60 * 1000
const ALERTA_CALIENTE_MS = 20 * 60 * 60 * 1000

// Al RESPONDER, la bandeja pasa a 'atendido' salvo que sea un carril deliberado (soporte).
// La TEMPERATURA (Eje 2) nunca se toca al responder: es otro campo.
const estadoAlResponder = (actual) => (actual === 'soporte' ? 'soporte' : 'atendido')

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
    // Si el navegador no sabe dibujar esa imagen (un HEIC del iPhone, un archivo
    // a medio copiar), sin esto la promesa no se resuelve NUNCA: la vista se
    // queda esperando para siempre y no aparece ni la miniatura ni un error. Se
    // sigue con el archivo tal cual y que decida el envío.
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

/**
 * Un `data:image/jpeg;base64,…` convertido en el mismo tipo de archivo que
 * entrega el 📎 de adjuntar, para que pueda seguir el camino de fotos de
 * siempre sin ningún trato especial.
 *
 * Nada de `fetch(dataUrl)`, que sería lo corto: acá el dato viene de otro
 * dominio por `postMessage` y pasarlo por la red —aunque sea "la red" de un
 * data URL— es darle a un string ajeno un camino que no necesita. `atob` no
 * sale del proceso, y si el base64 viene roto tira acá, antes de tocar nada.
 */
function archivoDesdeDataUrl(dataUrl, nombre) {
  const s = String(dataUrl)
  const crudo = atob(s.slice(s.indexOf(',') + 1))
  const bytes = new Uint8Array(crudo.length)
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i)
  return new File([bytes], nombre, { type: 'image/jpeg' })
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
  const [vista,        setVista]        = useState('CHAT') // 'CHAT' | 'CONTACTOS' | 'AUTO'
  // Canal = qué número se está atendiendo. La vista de chat es UNA sola y se
  // reutiliza; lo único que cambia es de dónde salen los datos y por dónde sale
  // la respuesta. Ver lib/canales.js.
  const [canal,        setCanal]        = useState(CANAL_POR_DEFECTO)
  const [pendientes,   setPendientes]   = useState({})   // { phoneId: nº pendientes }
  const [showTplModal, setShowTplModal] = useState(false)  // plantilla desde el chat (fuera de 24h)
  const [tplToast,     setTplToast]     = useState(null)
  const [convs,        setConvs]        = useState([])
  const [contacts,     setContacts]     = useState({})
  const [active,       setActive]       = useState(null)
  const [input,        setInput]        = useState('')
  // Envíos en fila por chat: { telefono: cuántos esperan turno o están saliendo }.
  // Reemplaza al viejo booleano `sending`, que había quedado muerto (nadie lo
  // encendía desde que handleSend dejó de bloquear).
  const [colaLen,      setColaLen]      = useState({})
  const [loading,      setLoading]      = useState(true)
  const [lastSync,     setLastSync]     = useState(null)
  const [search,       setSearch]       = useState('')
  const [searchMode,   setSearchMode]   = useState('contacto') // 'contacto' | 'mensaje'
  const [toast,        setToast]        = useState(null)
  const [showSidebar,  setShowSidebar]  = useState(true)
  const [showRight,    setShowRight]    = useState(false)
  const [rightWidth,   setRightWidth]   = useState(300) // ancho del panel derecho (px), redimensionable
  const [imgFiles,     setImgFiles]     = useState([]) // array de { file, preview }
  const [imgUploading, setImgUploading] = useState(false)
  const [imgProgress,  setImgProgress]  = useState(0)  // cuántas enviadas
  const [imgResult,    setImgResult]    = useState(null)
  const [isVideo,      setIsVideo]      = useState(false)
  // Aviso corto de los adjuntos ("eso no es una foto", "ya no caben más"). Sin
  // esto, pegar algo que no sirve no hace NADA en pantalla y parece un bug.
  const [avisoAdjunto, setAvisoAdjunto] = useState('')
  // Solo para pintar la capa de "suelta la foto acá" mientras se arrastra un
  // archivo por encima del chat. Ojo: NO es `arrastrandoAsa`, que es el del asa
  // del panel derecho.
  const [soltarAqui,   setSoltarAqui]   = useState(false)
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
  const avisoRef   = useRef(null)  // temporizador del aviso de adjuntos
  const taRef      = useRef(null)  // caja de texto del compositor (para enfocarla al citar)
  // Mensaje que se está citando al responder (null = ninguno).
  const [citando, setCitando] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const localStatusRef = useRef({})
  const localTempRef   = useRef({}) // override optimista de temperatura (Eje 2), hasta que el poll confirme
  const alertadosRef   = useRef(new Set()) // leads calientes ya notificados (1 aviso por ventana)
  const pendingRef     = useRef({}) // mensajes optimistas por teléfono, hasta que Make los registre
  // Fila de salida POR CONVERSACIÓN. Como los envíos ya no bloquean la interfaz, el
  // vendedor puede disparar una respuesta rápida de 4 fotos y, encima, mandar la foto
  // de otro producto: sin fila, esa foto se colaba ENTRE las de la respuesta rápida y
  // al cliente le llegaba todo mezclado. Acá lo que se clickea primero sale primero y
  // COMPLETO antes de que empiece lo siguiente. Chats distintos no se esperan entre sí.
  const colaRef        = useRef({})
  const seenRef        = useRef(null) // { telefono: epochMs } — última vez que se vio cada chat
  // Hilos completos ya descargados, por teléfono (carga por chat: /api/hilo).
  // La lista lateral solo trae el ÚLTIMO mensaje de cada conversación, así que el
  // historial vive aquí y se re-inyecta en cada poll para que no se recorte.
  const hilosRef       = useRef({})
  const activeRef      = useRef(null)
  const backGuardRef   = useRef(false) // móvil: entrada de historial empujada al abrir un chat (el "atrás" del celu vuelve a la lista en vez de salir de la app)
  const [msgHits,  setMsgHits]  = useState([])   // resultados de /api/buscar (modo Mensajes)
  const [buscando, setBuscando] = useState(false)

  // ── Panel derecho redimensionable (arrastra el borde izquierdo) ──
  const rightWidthRef = useRef(300)
  const resizingRef   = useRef(false)
  // Espejo en estado de `resizingRef`: solo sirve para pintar la capa que tapa
  // el iframe mientras se arrastra (ver más abajo).
  const [arrastrandoAsa, setArrastrandoAsa] = useState(false)
  useEffect(() => { rightWidthRef.current = rightWidth }, [rightWidth])

  // El ancho anterior va en una REF, no en estado, a propósito: hay que leerlo y
  // escribirlo dentro del mismo callback, y meter un `setRightWidth` dentro del
  // actualizador de un `useState` es un efecto secundario en un updater — React
  // los ejecuta dos veces en modo estricto y el ancho quedaría mal guardado.
  const anchoPrevioRef = useRef(null)

  // Qué panel tiene el formulario abierto. Son DOS y no un booleano suelto: el
  // panel de escritorio se pinta con `{activeConv && …}`, y `activeConv` sale de
  // un `find` sobre `convs` que se recalcula en CADA sondeo. Si un ciclo deja
  // fuera el chat activo, ese panel se desmonta y remonta, y su limpieza manda un
  // "false" mientras el cajón sigue con el formulario abierto. Con un booleano,
  // ese "false" apagaba el guard y volvíamos a descartar pedidos sin preguntar.
  const manualesRef = useRef({ escritorio: false, cajon: false })
  // Espejo en estado del mapa de arriba. El ref es el que manda en el guard
  // (hay que leerlo dentro del click, sin esperar a un render), pero un efecto no
  // puede reaccionar a un ref: esto es solo para enganchar y soltar el aviso de
  // `beforeunload` de las navegaciones duras.
  const [hayManualAbierto, setHayManualAbierto] = useState(false)

  // Qué panel está MIRANDO un pedido (VER PEDIDO, solo lectura). Va en un mapa
  // aparte del de arriba y NO entra en `hayQueConfirmarDescarte` a propósito:
  // ahí no hay nada escrito que perder, así que preguntar "¿lo descartas?" al
  // cerrarlo o al cambiar de chat sería molestar de gusto — y un aviso que
  // molesta de gusto se aprende a ignorar, que es como se pierde el que sí
  // importa. Lo ÚNICO que comparte con el formulario es el ancho del panel.
  const veresRef = useRef({ escritorio: false, cajon: false })
  // Espejo en estado de los DOS mapas: es lo que sube el piso del asa, y ese
  // piso hace falta con cualquiera de las dos vistas (el CRM se pasa a diseño de
  // celular por debajo de 768 px internos, mire uno o llene el otro). El aviso
  // de `beforeunload` NO usa este: ese sigue atado solo al formulario.
  const [hayAnchoPedido, setHayAnchoPedido] = useState(false)

  const recalcularAncho = useCallback(() => {
    setHayAnchoPedido(
      Object.values(manualesRef.current).some(Boolean) ||
      Object.values(veresRef.current).some(Boolean)
    )
  }, [])

  const anotarManuales = useCallback((mapa) => {
    manualesRef.current = mapa
    setHayManualAbierto(Object.values(mapa).some(Boolean))
    recalcularAncho()
  }, [recalcularAncho])

  const anotarVeres = useCallback((mapa) => {
    veresRef.current = mapa
    recalcularAncho()
  }, [recalcularAncho])

  // El ancho del panel, compartido por las dos vistas del CRM. Se llama DESPUÉS
  // de anotar el mapa correspondiente, porque para decidir si devolver el ancho
  // necesita ver el estado ya actualizado.
  const ajustarAnchoDelCrm = useCallback((abierto) => {
    if (abierto) {
      if (anchoPrevioRef.current === null) anchoPrevioRef.current = rightWidthRef.current
      // El ancho EXACTO del formulario, no "el que había si era mayor": si el
      // panel venía ancho, quedaba vacío a los lados y era justo la queja.
      setRightWidth(ANCHO_PEDIDO)
      return
    }
    // Si otro panel —o la otra vista— todavía tiene algo del CRM abierto, el
    // ancho se queda como está.
    if (Object.values(manualesRef.current).some(Boolean)) return
    if (Object.values(veresRef.current).some(Boolean)) return
    if (anchoPrevioRef.current !== null) {
      setRightWidth(anchoPrevioRef.current)
      anchoPrevioRef.current = null
      return
    }
    // Sin ancho guardado (lo abrió el otro panel): al menos volver al techo
    // normal, que si no el panel se queda más ancho de lo que el asa permite.
    setRightWidth(w => Math.min(ANCHO_MAX, w))
  }, [])

  const alPedidoManual = useCallback((donde, abierto) => {
    anotarManuales({ ...manualesRef.current, [donde]: abierto })
    ajustarAnchoDelCrm(abierto)
  }, [anotarManuales, ajustarAnchoDelCrm])

  // El camino de VER PEDIDO: ensancha igual y no toca `manualesRef`, o sea que
  // el guard ni se entera. Esa separación es todo el punto.
  const alVerPedido = useCallback((donde, abierto) => {
    anotarVeres({ ...veresRef.current, [donde]: abierto })
    ajustarAnchoDelCrm(abierto)
  }, [anotarVeres, ajustarAnchoDelCrm])

  // Una por instancia, y ESTABLES: `RightPanel` las tiene como dependencia de un
  // efecto, así que una función nueva en cada render lo dispararía a cada rato y
  // le pelearía el ancho al que esté arrastrando el asa.
  const alPedidoManualEscritorio = useCallback((abierto) => alPedidoManual('escritorio', abierto), [alPedidoManual])
  const alPedidoManualCajon      = useCallback((abierto) => alPedidoManual('cajon', abierto), [alPedidoManual])
  const alVerPedidoEscritorio    = useCallback((abierto) => alVerPedido('escritorio', abierto), [alVerPedido])
  const alVerPedidoCajon         = useCallback((abierto) => alVerPedido('cajon', abierto), [alVerPedido])

  /**
   * ¿Se puede soltar la conversación abierta? Decisión de Rodrigo: el asistente
   * del CRM son 4 pasos y un clic distraído en el chat de al lado no puede
   * tirarlos sin aviso. Devuelve false = quedarse donde estaba.
   *
   * Cuando el pedido se crea bien, `RightPanel` ya cerró el formulario antes de
   * esto, así que ahí no pregunta nada.
   */
  const puedoDejarLaConversacion = useCallback((destino) => {
    if (!hayQueConfirmarDescarte(manualesRef.current, activeRef.current, destino)) return true
    if (!window.confirm(AVISO_DESCARTAR_PEDIDO)) return false
    // Descartado: se limpia acá porque si el panel se DESMONTA (cerrar el chat,
    // cambiar de bandeja o de canal) no queda nadie que avise que se cerró.
    anotarManuales({ escritorio: false, cajon: false })
    return true
  }, [anotarManuales])

  // La ✕ del cajón móvil (y tocar fuera, que hace lo mismo) cierra el panel
  // derecho entero y con él el formulario. No es "cambiar de conversación", pero
  // para quien lo usa es el mismo gesto y se pierde lo mismo: pasa por el mismo
  // guard. Decisión de Rodrigo — preguntar en un caso y no en el otro se sentía
  // arbitrario.
  const cerrarCajonDerecho = useCallback(() => {
    if (!puedoDejarLaConversacion(null)) return
    setShowRight(false)
  }, [puedoDejarLaConversacion])

  // Las navegaciones DURAS —el 📊 que es un `<a href="/dashboard">` y el ↻ que
  // hace `location.reload()`, justo al pie de la lista de chats— se llevan la
  // página entera, y un `confirm` nuestro no las puede atrapar. El único que
  // llega a tiempo ahí es el aviso propio del navegador. Se engancha SOLO
  // mientras haya un formulario abierto: el resto del tiempo no molesta y no le
  // quita el bfcache a la app.
  useEffect(() => {
    if (!hayManualAbierto) return
    const alSalir = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [hayManualAbierto])

  // Los límites del asa, en una ref: el efecto de abajo se suscribe UNA vez (si
  // se volviera a montar, repetiría la restauración de localStorage y pisaría el
  // ancho), así que no puede leer el estado — los lee de acá en cada movimiento.
  //
  // Con el formulario abierto sube el PISO, no el techo: angostar de más metería
  // el ancho interno por debajo de 768 y el CRM se pasaría a su diseño de
  // celular a mitad de un pedido. Ensanchar no rompe nada (solo agrega vacío a
  // los lados), así que el techo sigue siendo el de siempre.
  const limitesRef = useRef({ min: ANCHO_MIN, max: ANCHO_MAX })
  useEffect(() => {
    limitesRef.current = hayAnchoPedido
      ? { min: ANCHO_MIN_PEDIDO, max: ANCHO_MAX }
      : { min: ANCHO_MIN,        max: ANCHO_MAX }
  }, [hayAnchoPedido])

  // Botón "atrás" del celular: al abrir un chat empujamos una entrada de historial
  // (en openConv) y acá la consumimos para VOLVER A LA LISTA en vez de salir de la app.
  // Solo actúa si nosotros empujamos la entrada (backGuardRef); en desktop el back navega normal.
  useEffect(() => {
    const onPop = () => {
      if (backGuardRef.current) {
        backGuardRef.current = false
        setShowSidebar(true)   // muestra la lista de chats (no sale de la app)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    try {
      const v = parseInt(localStorage.getItem('ind_right_width') || '', 10)
      if (v >= ANCHO_MIN && v <= ANCHO_MAX) setRightWidth(v)
    } catch {}
    const clamp = (w) => Math.min(limitesRef.current.max, Math.max(limitesRef.current.min, w))
    const onMove = (e) => {
      const que = decidirArrastre({ arrastrando: resizingRef.current, botones: e.buttons })
      if (que === 'nada') return
      if (que === 'soltar') { onUp(); return }   // el mouseup se perdió: cortar acá
      const x = e.touches ? e.touches[0].clientX : e.clientX
      setRightWidth(clamp(window.innerWidth - x)) // panel pegado al borde derecho
    }
    const onUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      setArrastrandoAsa(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try { localStorage.setItem('ind_right_width', String(rightWidthRef.current)) } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    // Cinturones: el puntero se va de la página, la ventana pierde el foco
    // (alt+tab a mitad de arrastre) o el sistema cancela el toque. En los tres
    // casos el `mouseup`/`touchend` puede no llegar nunca.
    document.addEventListener('mouseleave', onUp)
    window.addEventListener('blur', onUp)
    window.addEventListener('touchcancel', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      document.removeEventListener('mouseleave', onUp)
      window.removeEventListener('blur', onUp)
      window.removeEventListener('touchcancel', onUp)
    }
  }, [])
  const startResize = () => {
    resizingRef.current = true
    setArrastrandoAsa(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }
  if (seenRef.current === null) seenRef.current = loadSeen()

  // `sinCache: true` salta el caché compartido del edge. Se usa justo después de
  // cambiar algo (estado, temperatura) para no leer una respuesta vieja que
  // "deshaga" en pantalla lo que el vendedor acaba de hacer.
  const load = useCallback(async ({ sinCache = false } = {}) => {
    // Tres fuentes que se combinan (buildConvs deduplica por id de mensaje):
    //  · lista  → ÚLTIMO mensaje de cada conversación, sobre TODO el historial
    //             (hace que aparezcan también los chats viejos).
    //  · rows   → ventana reciente de la cuenta: mantiene el hilo abierto al día
    //             y da el conteo real de no leídos.
    //  · hilos  → historiales completos ya descargados al abrir cada chat.
    // UN request por ciclo (antes 3: lista+mensajes+contactos → /api/inbox-sync).
    // null (error) → se conservan los datos previos, no parpadea a blanco.
    const sync   = await fetchInboxSync({ sinCache })
    const lista  = sync?.lista ?? null
    const rows   = sync?.rows ?? null
    const ctList = sync?.contactos ?? null
    // Pendientes de TODOS los canales (incluido el que no se está mirando).
    if (sync?.pendientes) setPendientes(sync.pendientes)

    // null → hubo ERROR (no "vacío"): conservar lo previo, no parpadear a blanco
    if (Array.isArray(lista) || Array.isArray(rows)) {
      const hilos = Object.values(hilosRef.current).flat()
      // ORDEN IMPORTANTE: buildConvs deduplica por id y se queda con el PRIMERO que
      // ve. `lista` es la fuente más pobre (sale de una vista con menos columnas), así
      // que va al FINAL: si un mensaje viene por dos lados, gana la versión completa.
      // Con `lista` primero, el último mensaje de cada chat perdía la cita y la pauta.
      const todo  = [...(rows || []), ...hilos, ...(lista || [])]
      let next = buildConvs(todo, seenRef.current)
      // Re-inyectar mensajes optimistas que aún no están en la hoja
      const now = Date.now()
      const pend = pendingRef.current
      Object.keys(pend).forEach(tel => {
        const conv = next.find(c => c.telefono === tel)
        pend[tel] = (pend[tel] || []).filter(pm => {
          // Los fallidos NO expiran: son la única prueba en pantalla de que ese
          // mensaje no salió. Los demás sí, a los 90s.
          if (!pm._fallido && now - pm._pendingAt > 90000) return false
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
      // Igual para la temperatura (Eje 2): que el poll no pise un cambio recién hecho.
      Object.entries(localTempRef.current).forEach(([tel, override]) => {
        if (override.expiresAt > now && ctMap[tel]) ctMap[tel] = { ...ctMap[tel], temperatura: override.temperatura }
      })
      setContacts(ctMap)
    }

    setLastSync(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    // Polling de DOS velocidades para no castigar al vendedor:
    //  · chat abierto (active) → 10s: la conversación que está atendiendo se
    //    siente casi en vivo (mensajes entrantes aparecen rápido).
    //  · sin chat abierto      → 25s: solo lista/contactos, mucho más barato.
    // Y SOLO con la pestaña visible; en segundo plano se pausa (al volver refresca).
    const ms = active ? 10000 : 25000
    const start = () => { if (!pollRef.current) pollRef.current = setInterval(load, ms) }
    const stop  = () => { clearInterval(pollRef.current); pollRef.current = null }
    const onVisibility = () => { if (document.hidden) stop(); else { load(); start() } }
    load()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [load, active])

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

  // El service worker avisa cuando llegó un push: refrescamos al instante en vez de
  // dejar el polling corriendo en segundo plano (que costaría llamadas de más). Sin
  // esto el contador de la pestaña nunca alcanzaba a subir, porque con la pestaña
  // oculta el polling está detenido y `convs` no cambia.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMsg = (ev) => { if (ev.data?.tipo === 'push-recibido') load() }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [load])

  // ── Abrir un chat puntual desde un aviso push ────────────────────────────────
  // Lo pide el service worker al tocar la notificación, o viene en ?tel= cuando el
  // aviso tuvo que abrir una ventana nueva.
  const pedidoRef = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tel = new URLSearchParams(window.location.search).get('tel')
    if (tel) pedidoRef.current = tel
    if (!('serviceWorker' in navigator)) return
    const onMsg = (ev) => {
      if (ev.data?.tipo === 'abrir-chat' && ev.data.tel) pedidoRef.current = ev.data.tel
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const pedido = pedidoRef.current
    if (!pedido || !convs.length) return
    // El formato del webhook y el canónico de la base pueden diferir → últimos 9.
    const t9 = String(pedido).replace(/\D/g, '').slice(-9)
    const conv = convs.find(c => String(c.telefono).replace(/\D/g, '').slice(-9) === t9)
    if (!conv) return          // aún no llegó en este ciclo: reintenta al siguiente
    pedidoRef.current = null
    openConv(conv.telefono)
  }, [convs])

  // Cambiar de bandeja CIERRA el chat abierto: si no, al terminar de escribirle a un
  // cliente y pasar a "Pendientes" quedaba en pantalla la conversación anterior, que
  // ya no pertenece a esa bandeja. Se deja el panel del medio en blanco para elegir.
  const cambiarFiltro = (key) => {
    // Cierra el chat abierto → el PEDIDO MANUAL se perdería igual que al saltar
    // a otro cliente. Sin el formulario abierto esto no pregunta nada.
    if (!puedoDejarLaConversacion(null)) return
    setFilter(key)
    setActive(null)
    activeRef.current = null
    setCitando(null)
  }

  /**
   * Cambiar de número. Se limpia TODO lo que pertenece a la bandeja anterior:
   * si quedara el chat abierto o los hilos en memoria, se vería una conversación
   * del otro número y la respuesta saldría por el canal equivocado.
   */
  // Devuelve true si el canal terminó activo (ya lo estaba, o se cambió de
  // verdad); false si el guard del PEDIDO MANUAL canceló el salto. Quien llama
  // desde el buscador lo necesita: si esto da false, no hay que esperar un
  // chat que nunca va a llegar en el canal nuevo (porque el canal no cambió).
  const cambiarCanal = (id) => {
    // Cambiar de número cierra el chat abierto y desmonta el panel derecho: el
    // formulario se pierde. Volver a tocar el número que YA estás atendiendo no
    // pierde nada, así que el guard solo corre cuando el canal cambia de verdad.
    if (id !== canal && !puedoDejarLaConversacion(null)) return false
    setVista('CHAT')
    if (id === canal) return true
    setCanalActivo(id)        // manda a api-client: lecturas y envíos van por acá
    setCanal(id)
    setActive(null); activeRef.current = null
    setCitando(null)
    setConvs([]); setContacts({})
    hilosRef.current = {}     // hilos cargados del canal anterior
    pendingRef.current = {}   // burbujas optimistas del canal anterior
    setTimeout(load, 0)       // recarga ya, sin esperar al siguiente poll
    return true
  }

  const openConv = (telefono) => {
    // Único paso obligado para cambiar de chat: lo usan la lista, CONTACTOS y el
    // salto desde un aviso push. Con esto acá, los tres quedan cubiertos.
    if (!puedoDejarLaConversacion(telefono)) return
    setActive(telefono); activeRef.current = telefono
    setShowSidebar(false)
    setCitando(null)   // la cita pertenece al chat que estabas mirando
    // En móvil, empujamos una entrada de historial: así el botón "atrás" del celular
    // vuelve a la lista de chats en vez de salir de la app (una sola entrada mientras
    // navegamos chats; backGuardRef evita duplicar al saltar de chat en chat).
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches && !backGuardRef.current) {
      window.history.pushState({ inbox: 'chat' }, '')
      backGuardRef.current = true
    }
    autoScroll.current = true; prevMsgLen.current = 0
    seenRef.current[telefono] = Date.now(); saveSeen(seenRef.current)
    setConvs(prev => prev.map(c => c.telefono === telefono ? { ...c, unread: 0 } : c))
    cargarHilo(telefono)
  }

  // Historial completo del chat, bajo demanda. La lista lateral solo trae el
  // último mensaje de cada conversación, así que sin esto un chat viejo se vería
  // con una sola burbuja (el síntoma de "se borraron los mensajes").
  const cargarHilo = useCallback(async (telefono) => {
    if (!telefono) return
    const msgs = await fetchHilo(telefono)
    if (!Array.isArray(msgs) || !msgs.length) return
    hilosRef.current[telefono] = msgs
    // Solo conservamos los últimos 5 hilos abiertos: se re-inyectan en cada poll
    // (cada 8s) y guardar decenas de historiales completos costaría memoria y CPU.
    const abiertos = Object.keys(hilosRef.current)
    if (abiertos.length > 5) {
      abiertos.slice(0, abiertos.length - 5)
        .filter(t => t !== activeRef.current)
        .forEach(t => { delete hilosRef.current[t] })
    }
    setConvs(prev => prev.map(c => {
      if (c.telefono !== telefono) return c
      const merged = buildConvs([...c.msgs, ...msgs], seenRef.current)[0]
      return merged ? { ...c, msgs: merged.msgs, last: merged.last } : c
    }))
  }, [])

  // Teléfono que quedó esperando a que su canal termine de cargar, para
  // abrirlo apenas aparezca en `convs`. Lo usa SOLO el salto desde un
  // resultado del buscador (ver `irAResultadoBusqueda`).
  const saltoPendienteRef = useRef(null)
  useEffect(() => {
    const tel = saltoPendienteRef.current
    if (!tel) return
    if (!convs.some(c => c.telefono === tel)) return  // aún no llegó el conv de ese canal
    saltoPendienteRef.current = null
    openConv(tel)
  }, [convs])

  /**
   * Abrir un resultado del buscador (contacto o mensaje), sea del canal
   * activo o de OTRO número. Es el único camino que puede mezclar "cambiar de
   * pestaña" con "abrir un chat": primero mueve la pestaña con `cambiarCanal`
   * —que ya deja todo limpio y en orden— y SOLO cuando ese canal nuevo
   * terminó de cargar (arriba) se abre el chat. Nunca al revés: abrir el chat
   * antes de mover la pestaña dejaría el envío armado por el número
   * equivocado.
   *
   * Si el contacto ya es del canal activo, no hay nada que mover: abre
   * directo, igual que un clic común en la lista.
   */
  const irAResultadoBusqueda = (telefono) => {
    // ⚠️ Si esta conversación YA está en la lista de la pestaña donde estás, es
    // de este número: ábrela acá y no saltes a ningún lado.
    //
    // Sin esta línea, el 10-ago pulsar un chat en la pestaña del 9804 te
    // teletransportaba a la del 3326. El motivo: la ficha del contacto guarda el
    // número de su ÚLTIMO mensaje, que para quien escribió a los dos puede ser
    // el otro. Se saltaba aunque la conversación estuviera ahí mismo, delante.
    //
    // El salto es SOLO para los resultados que el buscador trae de otro canal:
    // esos no están en `convs` porque `convs` es de la pestaña activa.
    if (convs.some((c) => c.telefono === telefono)) { openConv(telefono); return }

    const canalDelContacto = canalDePhoneId(contacts[telefono]?.phoneId)
    if (canalDelContacto && canalDelContacto !== canal) {
      if (!cambiarCanal(canalDelContacto)) return  // el guard del pedido canceló el salto
      saltoPendienteRef.current = telefono
      return
    }
    openConv(telefono)
  }

  // Desde la pestaña CONTACTOS: vuelve al chat y abre la conversación (match por
  // últimos 9 dígitos, por si el formato del directorio difiere).
  const abrirChatDesdeContactos = (telefono) => {
    const t9 = String(telefono).replace(/\D/g, '').slice(-9)
    const conv = convs.find(c => String(c.telefono).replace(/\D/g, '').slice(-9) === t9)
    setVista('CHAT')
    openConv(conv ? conv.telefono : telefono)
  }

  // ── Alerta de leads 🔥 calientes cerca del cierre de la ventana de 24h ──
  // Dispara una notificación del navegador por lead y por ventana. El permiso ya no
  // se pide acá: Chrome silencia los pedidos sin gesto del usuario, así que ahora lo
  // pide el botón 🔔 (PushToggle) dentro de su click.
  useEffect(() => {
    const now = Date.now()
    Object.entries(contacts).forEach(([tel, c]) => {
      if ((c?.temperatura || '') !== 'caliente') return
      const ent = c?.ultimoEntranteAt ? new Date(c.ultimoEntranteAt).getTime() : 0
      if (!ent) return
      const ms = now - ent
      if (ms < ALERTA_CALIENTE_MS || ms >= VENTANA_MS) return
      const key = `${tel}:${ent}` // 1 alerta por ventana (mismo entrante = misma ventana)
      if (alertadosRef.current.has(key)) return
      alertadosRef.current.add(key)
      const nombre = c.alias || (convs.find(x => x.telefono === tel)?.nombre) || tel
      const horas  = Math.max(0, Math.ceil((VENTANA_MS - ms) / 3600000))
      notificar('🔥 Lead caliente por enfriarse', `${nombre}: se cierra la ventana de 24h en ~${horas}h. Escríbele ya.`, `caliente-${key}`)
    })
  }, [contacts, convs])

  const activeConv     = convs.find(c => c.telefono === active) || null
  const totalUnread    = convs.reduce((s, c) => s + c.unread, 0)
  // VENTA desacoplada del estado de flujo (igual que WA INBOX V2):
  // - getStatus = SOLO el estado real de bandeja (pendiente/atendido/soporte/archivado).
  // - "Venta" = tiene un PEDIDO CREADO (idVenta, col H). La pestaña 💰 filtra por eso y
  //   excluye archivados. Así un cliente con venta que vuelve a escribir aparece en
  //   PENDIENTE (para atenderlo) y a la vez sigue en 💰 Ventas.
  const hasVenta      = (tel) => String(contacts[tel]?.idVenta || '').trim() !== ''
  const getStatus     = (tel) => contacts[tel]?.estado || 'pendiente'
  const esVentaActiva = (tel) => hasVenta(tel) && getStatus(tel) !== 'archivado'
  // Eje 2: temperatura del lead ('' = sin clasificar).
  const getTemp = (tel) => contacts[tel]?.temperatura || ''
  const esTemp  = (key) => TEMP_META[key] !== undefined
  // Ventana de 24h: ms desde el último mensaje del cliente.
  const silencioMs = (tel) => {
    const t = contacts[tel]?.ultimoEntranteAt
    return t ? (Date.now() - new Date(t).getTime()) : Infinity
  }
  // 🔥 caliente que se acerca al cierre de la ventana (entre el umbral y las 24h) → ⏰.
  const alertaVentana = (tel) => {
    if (getTemp(tel) !== 'caliente') return false
    const ms = silencioMs(tel)
    return ms >= ALERTA_CALIENTE_MS && ms < VENTANA_MS
  }

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

  // Buscador por MENSAJE: va al servidor (/api/buscar) y mira TODO el historial.
  // Antes filtraba solo lo que estaba cargado en el navegador, así que no
  // encontraba nada fuera de la ventana reciente.
  useEffect(() => {
    if (!searchingMsgs || q.length < 2) { setMsgHits([]); setBuscando(false); return }
    let cancelado = false
    setBuscando(true)
    const t = setTimeout(async () => {
      const hits = await buscarEnMensajes(q)
      if (cancelado) return
      setMsgHits(Array.isArray(hits) ? hits : [])
      setBuscando(false)
    }, 350) // debounce: no dispara una consulta por tecla
    return () => { cancelado = true; clearTimeout(t) }
  }, [q, searchingMsgs])

  const t9de = (s) => String(s || '').replace(/\D/g, '').slice(-9)
  const hitsPorTel = React.useMemo(() => {
    const m = {}
    msgHits.forEach(h => { (m[t9de(h.telefono)] ||= []).push(h) })
    return m
  }, [msgHits])

  // Fragmento del mensaje más reciente que contiene la búsqueda (modo Mensajes)
  const matchSnippet = (c) => {
    const m = (hitsPorTel[t9de(c.telefono)] || [])[0]
    if (!m) return ''
    const t = String(m.mensaje || '')
    const i = t.toLowerCase().indexOf(q)
    const start = Math.max(0, i - 28), end = i + q.length + 42
    return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '')
  }

  // `contacts` viene SIN filtrar por canal (/api/inbox-sync pide getContactos(null)):
  // trae la ficha de un cliente esté su conversación en 3326 o en 9804. `convs`, en
  // cambio, solo trae las del canal de la pestaña activa. Sin esto, buscar a alguien
  // que escribió por el otro número daba "Sin resultados" aunque tuviera cientos de
  // mensajes — ver el bug medido: 73 conversaciones de IND en este caso.
  const contactoPorTel = (tel) => {
    const t9 = t9de(tel)
    const par = Object.entries(contacts).find(([ctel]) => t9de(ctel) === t9)
    return par ? par[1] : null
  }
  // Fila mínima para pintar un contacto que matchea pero NO está en `convs` (es de
  // otro canal). No hace falta el hilo completo acá: se carga recién al abrir el
  // chat (cargarHilo), igual que cualquier otra conversación.
  const filaMinima = (tel) => {
    const c = contactoPorTel(tel) || {}
    return { telefono: c.telefono || tel, nombre: c.nombre || tel, msgs: [], last: { timestamp: c.ultimoMensajeAt || null }, unread: 0 }
  }
  // A qué número pertenece un teléfono, para la etiqueta del resultado ('3326' / '9804').
  const canalEtiquetaDe = (tel) => {
    const c = contacts[tel] || contactoPorTel(tel)
    const idCanal = canalDePhoneId(c?.phoneId)
    return CANALES.find(x => x.id === idCanal)?.etiqueta || null
  }

  const searched = !isSearching ? convs
    : searchingMsgs
      ? (() => {
          // Teléfonos únicos que trajo /api/buscar (ya busca en TODO el historial,
          // de los dos números). Los que ya están en `convs` (canal activo) se usan
          // tal cual; el resto —de otro canal— se arma con una fila mínima.
          const propios = convs.filter(c => hitsPorTel[t9de(c.telefono)])
          const vistos  = new Set(propios.map(c => t9de(c.telefono)))
          const hitTels = [...new Set(msgHits.map(h => h.telefono))]
          const deOtros = hitTels.filter(tel => !vistos.has(t9de(tel))).map(filaMinima)
          return [...propios, ...deOtros]
        })()
      : (() => {
          const propios = convs.filter(c => {
            const alias = (contacts[c.telefono]?.alias || '').toLowerCase()
            return c.nombre.toLowerCase().includes(q) || alias.includes(q) || phoneMatch(c.telefono, search)
          })
          const vistos = new Set(propios.map(c => c.telefono))
          const deOtros = Object.entries(contacts)
            .filter(([tel]) => !vistos.has(tel))
            .filter(([tel, c]) => {
              const nombre = (c.nombre || '').toLowerCase()
              const alias  = (c.alias  || '').toLowerCase()
              return nombre.includes(q) || alias.includes(q) || phoneMatch(tel, search)
            })
            .map(([tel]) => filaMinima(tel))
          return [...propios, ...deOtros]
        })()
  // Al BUSCAR mostramos TODOS los resultados sin importar la pestaña activa: ni
  // bandeja (estado) ni NÚMERO (canal) — `searched` ya trae contactos del otro
  // canal (arriba). Fuera de la búsqueda, acá se aplica el filtro de siempre:
  // un solo filtro activo a la vez (venta / temperatura / bandeja), y por canal
  // ya viene recortado `convs`.
  const filtered = isSearching
    ? searched
    : searched.filter(c =>
        filter === 'venta' ? esVentaActiva(c.telefono)
        : esTemp(filter)   ? getTemp(c.telefono) === filter
        :                    getStatus(c.telefono) === filter)
  const counts = {
    pendiente:  searched.filter(c => getStatus(c.telefono) === 'pendiente').length,
    atendido:   searched.filter(c => getStatus(c.telefono) === 'atendido').length,
    archivado:  searched.filter(c => getStatus(c.telefono) === 'archivado').length,
    venta:      searched.filter(c => esVentaActiva(c.telefono)).length,
    soporte:    searched.filter(c => getStatus(c.telefono) === 'soporte').length,
    // Temperaturas (Eje 2)
    caliente:   searched.filter(c => getTemp(c.telefono) === 'caliente').length,
    tibio:      searched.filter(c => getTemp(c.telefono) === 'tibio').length,
    frio:       searched.filter(c => getTemp(c.telefono) === 'frio').length,
    // Calientes que se acercan a las 24h → para el aviso ⏰.
    alerta:     searched.filter(c => alertaVentana(c.telefono)).length,
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
    // El override tiene que durar MÁS que el caché del edge (s-maxage=5 +
    // stale-while-revalidate=20 = hasta 25 s de respuesta vieja). Con 15 s, al
    // expirar el override el poll podía traer todavía el estado anterior y el
    // botón "se revertía" solo. 35 s cubre la ventana con margen.
    localStatusRef.current[telefono] = { estado: status, expiresAt: Date.now() + 35000 }
    setContacts(prev => ({ ...prev, [telefono]: { ...(prev[telefono] || {}), estado: status } }))
    const conv = convs.find(c => c.telefono === telefono)
    await updateContact(telefono, conv?.nombre || '', status, contacts[telefono]?.alias || '', true)
    // Y se pide una lectura FRESCA saltando el caché: así el estado real llega en
    // segundos en vez de esperar a que el edge revalide.
    load({ sinCache: true }).catch(() => {})
  }

  // ── Cambiar TEMPERATURA del lead (Eje 2) — 100% manual ────────
  // Clic en la temperatura activa la QUITA (toggle). Nada más la toca.
  const changeTemperatura = async (telefono, temp) => {
    const actual = contacts[telefono]?.temperatura || ''
    const nueva  = actual === temp ? '' : temp
    // 35 s por lo mismo que en changeStatus: el override debe sobrevivir al caché
    // del edge (hasta 25 s), o el poll revierte el cambio en pantalla.
    localTempRef.current[telefono] = { temperatura: nueva, expiresAt: Date.now() + 35000 }
    setContacts(prev => ({ ...prev, [telefono]: { ...(prev[telefono] || {}), temperatura: nueva } }))
    const res = await updateTemperatura(telefono, nueva)
    if (res && res.ok === false) {
      delete localTempRef.current[telefono]
      setContacts(prev => ({ ...prev, [telefono]: { ...(prev[telefono] || {}), temperatura: actual } }))
      setToast({ ok: false, msg: '✗ No se pudo cambiar la temperatura — reintenta' })
      setTimeout(() => setToast(null), 4000)
    }
  }

  const handleUpdateContact = async ({ alias }) => {
    if (!activeConv) return
    const tel = activeConv.telefono
    const currentStatus = contacts[tel]?.estado || 'pendiente'
    setContacts(prev => ({ ...prev, [tel]: { ...(prev[tel] || {}), alias } }))
    await updateContact(tel, activeConv.nombre, currentStatus, alias)
  }

  /**
   * Pone `tarea` al final de la fila de ese chat y devuelve su promesa.
   * Si la fila está vacía (el caso normal) arranca al instante: esto no agrega
   * demora, solo impide que dos envíos al MISMO cliente se pisen.
   */
  const encolar = (telefono, tarea) => {
    const anterior = colaRef.current[telefono] || Promise.resolve()
    const actual   = anterior.then(tarea)   // `anterior` nunca rechaza: se guarda ya "atrapada"
    const marca    = actual.catch(() => {}) // un envío que falla no debe trabar la fila
    colaRef.current[telefono] = marca
    setColaLen(p => ({ ...p, [telefono]: (p[telefono] || 0) + 1 }))
    marca.then(() => {
      // Limpiar cuando esta tarea era la última: si no, quedaría una promesa por contacto.
      if (colaRef.current[telefono] === marca) delete colaRef.current[telefono]
      setColaLen(p => {
        const n = (p[telefono] || 1) - 1
        const c = { ...p }
        if (n > 0) c[telefono] = n; else delete c[telefono]
        return c
      })
    })
    return actual
  }

  /**
   * Un envío que Meta rechazó NO puede seguir pintado como enviado. Se marca la
   * burbuja con ⚠ y se queda en el hilo (no expira a los 90 s como las demás
   * optimistas): el vendedor tiene que poder ver EXACTAMENTE cuál no salió, en vez
   * de que el mensaje se evapore solo y el chat quede como atendido.
   */
  const marcarFallido = (telefono, id) => {
    const marcar = (m) => (m.id === id ? { ...m, estadoEntrega: 'failed', _fallido: true } : m)
    setConvs(prev => prev.map(c => c.telefono === telefono
      ? { ...c, msgs: c.msgs.map(marcar), last: marcar(c.last || {}) }
      : c))
    pendingRef.current[telefono] = (pendingRef.current[telefono] || []).map(marcar)
  }

  const handleSend = (text) => {
    const t = (text || input).trim()
    if (!t || !activeConv) return
    const tel = activeConv.telefono, nombre = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)
    // Se toma la cita ANTES de limpiarla: si el envío espera turno en la fila, la
    // barra ya no está pero el wamid citado tiene que viajar igual.
    const citaId = citando?.id || ''
    // El input se limpia YA aunque el mensaje espere turno: el vendedor sigue
    // escribiendo el siguiente sin quedarse mirando el cursor.
    setInput(''); setToast(null); setCitando(null); autoScroll.current = true
    return encolar(tel, async () => {
      // 1) Burbuja optimista cuando REALMENTE le toca salir, no al hacer clic: así el
      //    hilo en pantalla queda en el mismo orden en que le llega al cliente.
      const tmpMsg = { id: 'tmp_' + Date.now(), telefono: tel, nombre, mensaje: t, direccion: 'SALIENTE', timestamp: new Date().toISOString(), estado: 'enviado', _pendingAt: Date.now(), contextoId: citaId }
      setConvs(prev => prev.map(c => c.telefono === tel ? { ...c, msgs: [...c.msgs, tmpMsg], last: tmpMsg } : c))
      pendingRef.current[tel] = [ ...(pendingRef.current[tel] || []), tmpMsg ]
      // 2) Enviar
      const result = await sendReply(tel, nombre, t, citaId).catch(() => null)
      // 3) El chat pasa a atendido SOLO si el mensaje salió de verdad. Marcarlo antes
      //    de enviar (como se hacía) sacaba de PENDIENTES a clientes que nunca
      //    recibieron nada: el vendedor no los volvía a ver.
      const salio = Boolean(result && result.ok !== false)
      if (salio) changeStatus(tel, estadoDestino)
      else {
        // `result` null = la llamada ni siquiera respondió. Antes ese caso no avisaba
        // nada y el mensaje se perdía en silencio.
        marcarFallido(tel, tmpMsg.id)
        setToast(result || { ok: false, error: 'No se pudo enviar' })
        setTimeout(() => setToast(null), 4000)
      }
      // El mensaje salió, pero Meta rechazó la cita (mensaje viejo). Se avisa en vez
      // de que el vendedor crea que respondió citando y el cliente vea un texto suelto.
      if (result?.citaOmitida) {
        setToast({ ok: true, msg: '✓ Enviado, pero SIN la cita: WhatsApp ya no reconoce ese mensaje' })
        setTimeout(() => setToast(null), 4000)
      }
      setTimeout(load, 4000)
    })
  }

  const handleSendText = async (text, copyToInput) => {
    if (copyToInput !== undefined) { setInput(copyToInput); return }
    return handleSend(text)   // ya va por la fila del chat
  }

  const handleKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }

  // Recibe teléfono y nombre en vez de leerlos de `activeConv`: los envíos ya no
  // bloquean la interfaz, así que el vendedor puede cambiar de chat mientras una
  // respuesta rápida sigue saliendo — y las fotos que faltaban se irían al chat
  // equivocado si esta función mirara la conversación "actual".
  const sendImageUrl = async (telefono, nombre, imageUrl, mediaId = '') => {
    const res = await sendImageUrlApi(telefono, nombre, imageUrl, mediaId)
    // Si la foto no se pudo enviar (p. ej. pesa más de los 5 MB que acepta
    // WhatsApp), decirlo: antes moría en Meta y nadie se enteraba.
    if (!res.ok) {
      setToast({ ok: false, msg: `✗ ${res.error || 'No se pudo enviar la foto'}` })
      setTimeout(() => setToast(null), 6000)
    }
    return res.ok
  }

  // Mandar UN archivo de imagen al chat. Es el camino de fotos del inbox, tal
  // cual estaba escrito dentro del bucle de handleSendImage: primero la url
  // permanente en NUESTRO Supabase Storage (para que la burbuja del hilo tenga
  // qué pintar) y después el envío por media id. Si la subida falla NO se
  // cancela: el envío real va por media id igual.
  //
  // Se sacó a una función para poder REUSARLO desde la hoja del pedido que llega
  // del CRM (ver `handleEnviarHojaPedido`). Es el mismo código de siempre, ni
  // una línea distinta: no hay dos formas de mandar una foto en este inbox.
  const subirYEnviarFoto = async (telefono, nombre, file) => {
    let url = ''
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/upload-foto', { method:'POST', body:fd })
      const data = await res.json()
      if (res.ok && data.url) url = data.url
    } catch { /* seguimos por media id */ }
    return sendImageFile(telefono, nombre, file, url)
  }

  const avisarAdjunto = (texto) => {
    setAvisoAdjunto(texto || '')
    clearTimeout(avisoRef.current)
    if (texto) avisoRef.current = setTimeout(() => setAvisoAdjunto(''), 5000)
  }
  useEffect(() => () => clearTimeout(avisoRef.current), [])

  /**
   * La ÚNICA puerta de entrada de archivos a la caja de escribir. La usan el 📎,
   * Ctrl+V y arrastrar-y-soltar: las tres traen una lista de File y de acá para
   * abajo el camino es el mismo de siempre (`imgFiles` → `handleSendImage`).
   * Qué se hace con esa lista lo decide `decidirAdjuntos`, que está aparte y
   * probado (ver tests/adjuntos.test.js).
   */
  const agregarAdjuntos = async (entrantes) => {
    const lista = Array.from(entrantes || [])
    if (!lista.length) return
    const plan = decidirAdjuntos({ actuales: imgFiles.length, esVideoActual: isVideo, entrantes: lista })
    avisarAdjunto(plan.aviso)
    if (plan.accion === 'nada') return
    setImgResult(null)

    if (plan.tipo === 'video') {
      setIsVideo(true)
      setImgFiles([{ file: plan.archivos[0], preview: URL.createObjectURL(plan.archivos[0]) }])
      return
    }

    const procesadas = await Promise.all(plan.archivos.map(async f => ({
      file: await toJpeg(f),
      preview: await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(f) })
    })))
    if (plan.accion === 'reemplazar') {
      setIsVideo(false)
      setImgFiles(procesadas)
    } else {
      // El `slice` no sobra: procesar es asíncrono y dos pegados seguidos y
      // rápidos deciden los dos contra el mismo `imgFiles.length` viejo. Acá,
      // dentro del updater, se ve el estado de verdad.
      setImgFiles(prev => [...prev, ...procesadas].slice(0, TOPE_FOTOS))
    }
  }

  const handleFileSelect = async (e) => {
    await agregarAdjuntos(e.target.files)
    // El input se limpia siempre: si no, elegir DOS VECES la misma foto no
    // dispara `change` la segunda vez y parece que el 📎 dejó de funcionar.
    if (fileRef.current) fileRef.current.value = ''
  }

  /**
   * Ctrl+V en la caja de escribir, como en WhatsApp Web.
   * Solo se mete cuando lo pegado son archivos de verdad; el pegado de texto de
   * toda la vida NO se toca (ver la trampa de Excel en lib/adjuntos.js).
   */
  const handlePaste = (e) => {
    const dt = e.clipboardData
    if (!dt) return
    const archivos = Array.from(dt.files || [])
    const decision = decidirPegado({ tieneArchivos: archivos.length > 0, texto: dt.getData('text/plain') })
    if (decision !== 'adjuntar') return
    e.preventDefault()
    agregarAdjuntos(archivos)
  }

  /**
   * Ctrl+V con el chat abierto pero SIN el cursor dentro de la caja.
   *
   * Es el caso normal, no el raro: se toma la captura, se vuelve a la pestaña
   * del inbox y se pega. Nadie hace clic en la caja primero. Sin esto el pegado
   * "no funciona" la mitad de las veces y parece un bug.
   *
   * Solo actúa cuando NADIE más reclama el pegado: si el foco está en un campo
   * de texto (la búsqueda, el nombre del contacto, la propia caja de escribir)
   * manda ese campo. La caja tiene su propio `onPaste`.
   */
  const pasteRef = useRef(handlePaste)
  useEffect(() => { pasteRef.current = handlePaste })
  useEffect(() => {
    // Solo con el chat a la vista: en CONTACTOS y AUTOMATIZACIONES el chat sigue
    // montado detrás (se oculta con `display:none`), y pegar ahí dejaría una foto
    // encolada en una conversación que ni se está viendo.
    if (!activeConv || vista !== 'CHAT') return
    const alPegarEnLaPagina = (e) => {
      const el = e.target
      const escribiendo = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (escribiendo) return
      pasteRef.current(e)
    }
    window.addEventListener('paste', alPegarEnLaPagina)
    return () => window.removeEventListener('paste', alPegarEnLaPagina)
  }, [activeConv, vista])

  // ── Arrastrar y soltar una foto sobre el chat ──────────────────────
  const traeArchivos = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')

  const alArrastrarEncima = (e) => {
    if (!traeArchivos(e)) return
    e.preventDefault()
    setSoltarAqui(true)
  }
  const alSalirArrastrando = (e) => {
    // `dragleave` también salta al pasar de un hijo a otro dentro del chat: si
    // se apagara siempre, la capa parpadearía todo el rato.
    if (e.currentTarget.contains(e.relatedTarget)) return
    setSoltarAqui(false)
  }
  const alSoltar = (e) => {
    if (!traeArchivos(e)) return
    e.preventDefault()
    setSoltarAqui(false)
    agregarAdjuntos(e.dataTransfer?.files)
  }

  // Red de seguridad del navegador: si una foto se suelta FUERA del chat, por
  // defecto Chrome navega a ese archivo y se pierde el inbox entero (chat
  // abierto, borrador, tanda a medio armar). Esto se lo traga.
  useEffect(() => {
    const tragar = (e) => { if (traeArchivos(e)) e.preventDefault() }
    window.addEventListener('dragover', tragar)
    window.addEventListener('drop', tragar)
    return () => {
      window.removeEventListener('dragover', tragar)
      window.removeEventListener('drop', tragar)
    }
  }, [])

  const handleSendImage = async () => {
    if (!imgFiles.length || !activeConv) return
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)
    const archivos = imgFiles
    setImgUploading(true); setImgResult(null); setImgProgress(0)
    try {
      // Toda la tanda entra como UNA sola tarea en la fila: las fotos del computador
      // tampoco deben intercalarse con las de una respuesta rápida en curso.
      await encolar(telefono, async () => {
      let allOk = true
      let sendErr = ''
      if (isVideo) {
        const result = await sendVideo(telefono, nombre, archivos[0].file)
        allOk = result.ok
        if (!result.ok) sendErr = result.error || ''
      } else {
        for (let i = 0; i < archivos.length; i++) {
          // La url permanente en NUESTRO Storage + el envío por media id: los dos
          // pasos viven en `subirYEnviarFoto` (arriba), que es de donde salieron
          // y donde está explicado el porqué de cada uno.
          const { ok } = await subirYEnviarFoto(telefono, nombre, archivos[i].file)
          if (!ok) allOk = false
          setImgProgress(i + 1)
          if (i < archivos.length - 1) await new Promise(r => setTimeout(r, 800))
        }
      }
      setImgResult({ ok: allOk, error: sendErr })
      // Solo si TODAS salieron: si una foto se cayó, el cliente quedó a medias y el
      // chat tiene que seguir en PENDIENTES.
      if (allOk) await changeStatus(telefono, estadoDestino)
      })
      setTimeout(() => { setImgFiles([]); setImgResult(null); setIsVideo(false); setImgProgress(0); if (fileRef.current) fileRef.current.value = '' }, 1500)
      setTimeout(load, 4000)
    } catch { setImgResult({ ok: false }) }
    finally  { setImgUploading(false) }
  }

  const cancelImage = () => {
    imgFiles.forEach(f => { if (isVideo) URL.revokeObjectURL(f.preview) })
    setImgFiles([]); setImgResult(null); setIsVideo(false); setImgProgress(0); avisarAdjunto('')
    if (fileRef.current) fileRef.current.value = ''
  }

  /**
   * "↩ Responder" sobre una burbuja: además de fijar la cita, deja el cursor
   * DENTRO de la caja. Antes había que dar un clic extra en la caja para poder
   * escribir, y ese clic se olvida (tocas Responder, escribes, y no se escribió
   * nada).
   *
   * El foco va después de pintar y no en la misma línea: al citar aparece la
   * barra de la cita ARRIBA del textarea, que lo mueve; enfocarlo antes de que
   * el navegador lo recoloque deja la vista saltando.
   */
  const responderA = (msg) => {
    setCitando(msg)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      // El cursor al FINAL de lo que ya estuviera escrito, no al principio:
      // citar a media frase no debe partir el borrador en dos.
      const fin = ta.value.length
      ta.setSelectionRange(fin, fin)
    })
  }

  // Burbuja optimista + envío de texto. Se usa DENTRO de una tarea ya encolada
  // (NO encola por su cuenta): si acá se llamara a handleSend, que sí encola, la
  // tarea quedaría esperándose a sí misma y no saldría nada.
  const enviarTextoSuelto = async (telefono, nombre, texto) => {
    const tmpMsg = { id: 'tmp_' + Date.now(), telefono, nombre, mensaje: texto, direccion: 'SALIENTE', timestamp: new Date().toISOString(), estado: 'enviado', _pendingAt: Date.now() }
    setConvs(prev => prev.map(c => c.telefono === telefono ? { ...c, msgs: [...c.msgs, tmpMsg], last: tmpMsg } : c))
    pendingRef.current[telefono] = [ ...(pendingRef.current[telefono] || []), tmpMsg ]
    const result = await sendReply(telefono, nombre, texto).catch(() => null)
    if (!result || result.ok === false) marcarFallido(telefono, tmpMsg.id)
    return result
  }

  // `onProgress(hechas, total)` deja que el botón muestre "2/5" sin que el panel
  // tenga que esperar a que termine todo.
  const handleQuickReply = async (reply, onProgress) => {
    if (!activeConv) return
    // Se congelan acá: el vendedor puede cambiar de chat mientras esto sale.
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)

    // Recoger hasta 10 imágenes
    const imgs = Array.from({length: 10}, (_, i) =>
      i === 0 ? reply.imageUrl : reply[`imageUrl${i+1}`]
    ).filter(Boolean)

    const total = (reply.text ? 1 : 0) + imgs.length
    let hechas = 0
    const avanzar = () => { hechas += 1; onProgress?.(hechas, total) }

    // Arranca YA la resolución de las fotos a media id, las N en paralelo, y FUERA
    // de la fila a propósito: aunque esta respuesta rápida tenga que esperar turno,
    // sus fotos se van preparando mientras tanto y cuando le toque salir ya están
    // listas. La segunda vez esto responde de la caché y es instantáneo; antes cada
    // foto se descargaba y se subía a Meta recién en su turno.
    const idsPromesa = imgs.length ? precacheMedia(imgs) : Promise.resolve({})

    // Toda la respuesta rápida es UNA tarea: nada puede meterse entre su texto y
    // sus fotos, ni entre una foto y la siguiente.
    return encolar(telefono, async () => {
      // Si CUALQUIER pieza de la respuesta rápida falla, el chat no puede quedar
      // como atendido: al cliente le llegó media respuesta o ninguna.
      let todoOk = true
      const botones = (reply.botones || []).filter(Boolean).slice(0, 3)
      if (botones.length && reply.text) {
        // Respuesta rápida CON botones interactivos
        const validBtns = botones.map((t, i) => ({ id: `btn_${i + 1}`, title: t }))
        // El servidor guarda SOLO el cuerpo en `mensaje`; los botones van aparte en `botones`
        // (así el texto optimista coincide con lo guardado → la reconciliación descarta el
        // temporal sin duplicar, y la burbuja pinta los botones desde `botones`).
        const tmpMsg = { id: 'tmp_' + Date.now(), telefono, nombre, mensaje: reply.text, botones: validBtns, direccion: 'SALIENTE', timestamp: new Date().toISOString(), estado: 'enviado', _pendingAt: Date.now() }
        setConvs(prev => prev.map(c => c.telefono === telefono ? { ...c, msgs: [...c.msgs, tmpMsg], last: tmpMsg } : c))
        pendingRef.current[telefono] = [ ...(pendingRef.current[telefono] || []), tmpMsg ]
        // Se ESPERA (antes iba suelto): las fotos tienen que salir después del texto.
        const r = await sendInteractiveButtons(telefono, nombre, reply.text, validBtns).catch(() => null)
        if (!r || r.ok === false) { todoOk = false; marcarFallido(telefono, tmpMsg.id) }
        avanzar()
      } else if (reply.text) {
        // enviarTextoSuelto ya marca su propia burbuja si falla.
        const r = await enviarTextoSuelto(telefono, nombre, reply.text)
        if (!r || r.ok === false) todoOk = false
        avanzar()
      }

      // Envía las imágenes en orden (WhatsApp respeta el orden de llegada). La pausa
      // era de 800 ms cuando cada envío tardaba segundos; ahora que van por media id
      // alcanza con un respiro corto.
      const ids = await idsPromesa
      for (let i = 0; i < imgs.length; i++) {
        const ok = await sendImageUrl(telefono, nombre, imgs[i], ids[imgs[i]] || '')
        if (!ok) todoOk = false
        avanzar()
        if (i < imgs.length - 1) await new Promise(r => setTimeout(r, 150))
      }

      if (todoOk) changeStatus(telefono, estadoDestino)
      else { setToast({ ok: false, error: 'La respuesta rápida no salió completa' }); setTimeout(() => setToast(null), 4000) }
      setTimeout(load, 4000)
    })
  }

  // Foto de producto (Tienda: Shopify / sucursal). Su URL también es fija, así que
  // la primera vez que se manda queda su media id en caché y de ahí sale al toque.
  // Va por la fila: si hay una respuesta rápida saliendo, esta foto espera a que
  // termine en vez de meterse en el medio.
  const handleSendAIImage = async (imageUrl) => {
    if (!activeConv || !imageUrl) return
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)
    return encolar(telefono, async () => {
      const ok = await sendImageUrl(telefono, nombre, imageUrl)
      if (ok) changeStatus(telefono, estadoDestino)
    })
  }

  /**
   * Producto de la Tienda: 'foto' manda solo la imagen, 'info' manda título+precio
   * y después la imagen. Los dos mensajes van como UNA tarea de la fila — si fueran
   * dos, algo clickeado en el medio podría meterse entre el título y su foto.
   */
  const handleSendProducto = async (p, modo = 'foto') => {
    if (!activeConv || !p) return
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)
    return encolar(telefono, async () => {
      if (modo === 'info') {
        await enviarTextoSuelto(telefono, nombre, `${p.title}${p.price ? ` — $${p.price}` : ''}`)
      }
      const ok = await sendImageUrl(telefono, nombre, p.image)
      if (ok) changeStatus(telefono, estadoDestino)
      setTimeout(load, 4000)
    })
  }

  /**
   * La hoja del pedido, al chat del cliente, como foto.
   *
   * ⚠️ DE DÓNDE SALE LA IMAGEN: la dibuja el CRM. La pantalla del pedido abierta
   * en el panel (un iframe de `crm.apps.mandarinaec.com`) tiene un botón
   * «📤 Enviar al cliente» que arma la hoja como JPG y la manda por
   * `postMessage`. El inbox no la genera: la recibe ya hecha. Quién valida ese
   * mensaje —y por qué hay que validarlo tan en serio, siendo de otro dominio—
   * está en `leerHojaPedido` (lib/pedido-manual) y en `VerPedido`.
   *
   * De acá para abajo NO hay nada nuevo: la hoja se vuelve un archivo igual al
   * que da el 📎 y sale por `subirYEnviarFoto`, el mismo camino de todas las
   * fotos del inbox. Va por la fila del chat, así que si hay una respuesta
   * rápida saliendo, espera su turno en vez de meterse en el medio.
   *
   * Devuelve `{ ok, error }` y el panel lo pinta. Nunca `undefined` en silencio:
   * un fallo mudo deja al vendedor creyendo que el cliente ya tiene la hoja.
   */
  const handleEnviarHojaPedido = async (hoja) => {
    if (!activeConv) return { ok: false, error: 'No hay un chat abierto' }
    if (!hoja?.imagen)  return { ok: false, error: 'No llegó la imagen de la hoja' }
    // Fuera de las 24 h WhatsApp no deja mandar una foto y Meta la rechaza sin
    // decir mucho. Mejor decirlo acá, con el nombre de la causa.
    if (!windowOpen) return { ok: false, error: 'la ventana de 24 h está cerrada' }
    const peso = bytesDeDataUrl(hoja.imagen)
    if (peso > MAX_HOJA_BYTES) {
      return { ok: false, error: `la hoja pesa ${(peso / 1048576).toFixed(1)} MB y WhatsApp acepta hasta 5 MB` }
    }
    // El chat es el que está abierto, que es el mismo del pedido que se está
    // mirando: `RightPanel` cierra VER PEDIDO al cambiar de teléfono, así que
    // esta vista no puede sobrevivir a un cambio de cliente.
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const estadoDestino = estadoAlResponder(currentStatus)
    return encolar(telefono, async () => {
      let archivo
      try {
        archivo = archivoDesdeDataUrl(hoja.imagen, `pedido-${hoja.pedidoId}.jpg`)
      } catch {
        return { ok: false, error: 'la imagen llegó dañada' }
      }
      const res = await subirYEnviarFoto(telefono, nombre, archivo)
      if (res?.ok) {
        await changeStatus(telefono, estadoDestino)
        setTimeout(load, 4000)
        return { ok: true }
      }
      return { ok: false, error: res?.error || 'WhatsApp no aceptó la foto' }
    })
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
    // Igual que changeStatus y la temperatura: por encima del caché del edge.
    localIARef.current[tel] = { modoIA: next, expiresAt: Date.now() + 35000 }
    setContacts(prev => ({ ...prev, [tel]: { ...(prev[tel] || {}), modoIA: next } }))
    await toggleIAMode(tel, activeConv.nombre, currentStatus, contacts[tel]?.alias || '', next)
    setTogglingIA(false)
  }

  const handleSendButtons = async () => {
    if (!activeConv || !input.trim()) return
    const validBtns = btnTexts.map((t,i) => ({ id:`btn_${i+1}`, title:t.trim() })).filter(b=>b.title)
    if (validBtns.length === 0) return
    const telefono = activeConv.telefono
    const nombre   = activeConv.nombre
    const cuerpo   = input.trim()
    const estadoDestino = estadoAlResponder(currentStatus)
    setSendingBtns(true)
    setInput(''); setBtnTexts(['','','']); setShowBtnPanel(false)
    return encolar(telefono, async () => {
      // mensaje = solo el cuerpo (igual a lo que guarda el servidor) + botones aparte → sin duplicado.
      const tmpMsg = { id:'tmp_'+Date.now(), telefono, nombre, mensaje:cuerpo, botones:validBtns, direccion:'SALIENTE', timestamp:new Date().toISOString(), estado:'enviado', _pendingAt: Date.now() }
      setConvs(prev=>prev.map(c=>c.telefono===telefono?{...c,msgs:[...c.msgs,tmpMsg],last:tmpMsg}:c))
      pendingRef.current[telefono] = [ ...(pendingRef.current[telefono] || []), tmpMsg ]
      const result = await sendInteractiveButtons(telefono, nombre, cuerpo, validBtns)
      setSendingBtns(false); setToast(result); setTimeout(()=>setToast(null),4000)
      if (result.ok) { await changeStatus(telefono, estadoDestino); setTimeout(load,4000) }
    })
  }

  const currentContact     = activeConv ? contacts[activeConv.telefono] : null
  // Cuántos envíos hay saliendo o esperando turno en el chat abierto.
  const enFila             = activeConv ? (colaLen[activeConv.telefono] || 0) : 0
  const currentStatus      = currentContact?.estado || 'pendiente'
  const currentStatusView  = activeConv ? getStatus(activeConv.telefono) : 'pendiente'
  // El fallback a contacts[tel]?.nombre hace falta para los resultados de OTRO
  // canal: no están en `convs` (que solo trae el canal activo), así que
  // `convs.find` nunca los encuentra y sin esto se veía el teléfono pelado.
  const displayName        = (tel) => contacts[tel]?.alias || convs.find(c=>c.telefono===tel)?.nombre || contacts[tel]?.nombre || tel

  return (
    <>
      {/* Va lo primero y fuera de todo layout: es fixed y tiene que verse aunque
          la pantalla esté en cualquier pestaña o con el cajón móvil abierto. */}
      <AvisoSesion />
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
          /* Cabecera en 2 filas: info arriba, acciones en tira scrollable abajo
             (evita que los botones se envuelvan y se tapen entre sí en móvil). */
          .chat-header-left{ flex:1 1 100% !important; }
          .chat-actions{ flex:1 1 100% !important; flex-wrap:nowrap !important; overflow-x:auto; justify-content:flex-start !important; padding-bottom:2px; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
          .chat-actions::-webkit-scrollbar{ display:none; }
          .chat-actions > *{ flex-shrink:0 !important; }
        }
      `}</style>

      {(showSidebar && active) && <div className="overlay" onClick={() => setShowSidebar(false)} />}
      {showRight && <div className="overlay" onClick={cerrarCajonDerecho} />}

      {/* ⚠️ Capa transparente que TAPA EL IFRAME mientras se arrastra el asa.
          Sin esto, al pasar el puntero sobre el formulario del CRM —que es un
          iframe de otro origen— los eventos del mouse se los queda el documento
          del CRM: el panel deja de seguir al asa y, peor, si se suelta el botón
          ahí el `mouseup` no llega nunca. El arrastre se quedaba pegado y
          después mover el mouse sin apretar nada redimensionaba el panel.
          Con la capa puesta, el puntero nunca entra al iframe y el `mouseup`
          siempre cae en nuestro documento. */}
      {arrastrandoAsa && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:9999, cursor:'col-resize' }} />
      )}

      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden' }}>

        {/* ══════ HEADER + PESTAÑAS ══════ */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, flexShrink:0, height:42, background:C.bg, borderBottom:`1px solid ${C.border}`, zIndex:200, overflowX:'auto' }}>
          <div style={{ width:26, height:26, background:C.cream, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:C.bg, letterSpacing:'-0.5px', flexShrink:0 }}>IND</div>
          {/* Un botón por número + las vistas de siempre. El chat NO se duplica:
              es el mismo panel, solo cambia el canal que se está atendiendo. */}
          {CANALES.map((c) => {
            const activo = vista === 'CHAT' && canal === c.id
            const n = pendientes[c.phoneId] || 0
            return (
              <button key={c.id} onClick={() => cambiarCanal(c.id)} title={c.titulo} style={{
                padding:'4px 12px', border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, height:'100%',
                display:'flex', alignItems:'center', gap:6,
                background: activo ? 'rgba(244,241,236,.1)' : 'transparent',
                borderTop:'2px solid transparent',
                borderBottom: activo ? `2px solid ${C.cream}` : '2px solid transparent',
                color: activo ? C.cream : C.creamFaint, fontWeight:800, fontSize:11, letterSpacing:'1px', fontFamily:'inherit', transition:'all .2s',
              }}>
                💬 {c.etiqueta}
                {/* El contador es lo que impide que la bandeja que no miras se
                    vuelva invisible y se pierdan clientes ahí dentro. */}
                {n > 0 && (
                  <span style={{
                    background:'#f87171', color:'#fff', borderRadius:9, minWidth:17, height:17,
                    display:'inline-flex', alignItems:'center', justifyContent:'center',
                    fontSize:9.5, fontWeight:900, padding:'0 5px', letterSpacing:0,
                  }}>{n}</span>
                )}
              </button>
            )
          })}
          {[
            { id:'CONTACTOS', label:'👥 CONTACTOS' },
            { id:'AUTO',      label:'⚙️ AUTOS' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setVista(id)} style={{
              padding:'4px 14px', border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, height:'100%',
              background: vista===id ? 'rgba(244,241,236,.1)' : 'transparent',
              borderTop:'2px solid transparent',
              borderBottom: vista===id ? `2px solid ${C.cream}` : '2px solid transparent',
              color: vista===id ? C.cream : C.creamFaint, fontWeight:800, fontSize:11, letterSpacing:'1px', fontFamily:'inherit', transition:'all .2s',
            }}>{label}</button>
          ))}
        </div>

        <div className="app-shell" style={{ flex:1, minHeight:0, height:0, display: vista==='CHAT' ? 'flex' : 'none' }}>

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
                <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                  <button onClick={() => setVista('AUTO')} title="Mensajes de saludo (automatizaciones)" style={{ background:'rgba(244,241,236,.1)', border:'1px solid rgba(244,241,236,.28)', color:C.cream, borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>👋</button>
                  <a href="/dashboard" title="Dashboard" style={{ background:'rgba(96,165,250,.14)', border:'1px solid rgba(96,165,250,.3)', color:'#60a5fa', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>📊</a>
                  <PushToggle />
                </div>
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
                  { key:'venta',        label:'Ventas',       icon:'💰', color:'#10b981' },
                ].map(({ key, label, icon, color }) => (
                  <button key={key} onClick={() => cambiarFiltro(key)} style={{
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
                <button onClick={() => cambiarFiltro('soporte')} style={{
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
                <button onClick={() => cambiarFiltro('archivado')} style={{
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
              {/* Fila TEMPERATURA del lead (Eje 2, manual) */}
              <div style={{ display:'flex', gap:4, marginTop:4 }}>
                {TEMPERATURAS.map(({ key, icon, label, color }) => (
                  <button key={key} onClick={() => cambiarFiltro(key)} style={{
                    flex:1, padding:'5px 2px', fontSize:9, fontWeight:700,
                    background:filter===key?`${color}18`:'transparent',
                    border:`1px solid ${filter===key?color+'40':C.border}`,
                    color:filter===key?color:C.creamFaint,
                    borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                  }}>
                    {icon} {label}
                    {key==='caliente' && counts.alerta>0 && <span title={`${counts.alerta} caliente(s) cerca de cerrar la ventana de 24h`} style={{ marginLeft:3 }}>⏰</span>}
                    {counts[key]>0 && <span style={{ marginLeft:3, background:filter===key?color:C.border2, color:filter===key?C.bg:C.creamDim, borderRadius:10, padding:'0 4px', fontSize:8, fontWeight:800 }}>{counts[key]}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {loading ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:48, gap:12 }}>
                  <Spinner size={24} /><span style={{ fontSize:11, color:C.creamFaint }}>Cargando...</span>
                </div>
              ) : buscando ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:48, gap:12 }}>
                  <Spinner size={20} /><span style={{ fontSize:11, color:C.creamFaint }}>Buscando en todo el historial...</span>
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
                {filtered.map(conv => {
                  // Solo se calcula buscando: es el único momento en que la pestaña
                  // señala a qué número pertenece cada resultado.
                  const canalLabel    = isSearching ? canalEtiquetaDe(conv.telefono) : null
                  const canalDistinto = isSearching && canalLabel !== null && canalDePhoneId(contacts[conv.telefono]?.phoneId) !== canal
                  return (
                    <ContactRow key={conv.telefono} conv={{ ...conv, nombre: displayName(conv.telefono) }} isActive={active===conv.telefono} onClick={() => irAResultadoBusqueda(conv.telefono)}
                      search={search} estado={getStatus(conv.telefono)} modoIA={getModoIA(conv.telefono)} temp={getTemp(conv.telefono)} alerta={alertaVentana(conv.telefono)} msgSnippet={searchingMsgs ? matchSnippet(conv) : null}
                      canalLabel={canalLabel} canalDistinto={canalDistinto} />
                  )
                })}
              </>)}
            </div>

            <div style={{ padding:'7px 14px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:10, color:C.creamFaint }}>{lastSync?'Sync '+lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}</span>
              <button onClick={() => window.location.reload()} style={{ background:`rgba(244,241,236,.06)`, border:`1px solid rgba(244,241,236,.15)`, color:C.cream, borderRadius:7, width:30, height:30, cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center' }}>↻</button>
            </div>
          </div>

          {/* ══════ CHAT ══════ */}
          {activeConv ? (
            /* Todo el chat es zona de soltar, no solo la caja de escribir: la mano
               suelta la foto donde está mirando, que es la conversación. El
               `position:relative` es para la capa de "suelta acá" de abajo. */
            <div className="chat-col" style={{ position:'relative' }}
              onDragOver={alArrastrarEncima} onDragLeave={alSalirArrastrando} onDrop={alSoltar}>
              {soltarAqui && (
                <div style={{
                  position:'absolute', inset:0, zIndex:50, pointerEvents:'none',
                  background:'rgba(10,10,10,.88)', border:`2px dashed ${C.cream}`, borderRadius:12,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
                }}>
                  <div style={{ fontSize:44 }}>📥</div>
                  <div style={{ color:C.cream, fontWeight:800, fontSize:15 }}>Suelta la foto acá</div>
                  <div style={{ color:C.creamDim, fontSize:11 }}>imágenes o un video · también funciona Ctrl+V</div>
                </div>
              )}
              {/* Header chat */}
              <div className="chat-header" style={{ padding:'8px 10px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', flexWrap:'wrap', flexShrink:0, gap:6 }}>
                <div className="chat-header-left" style={{ display:'flex', alignItems:'center', gap:7, minWidth:0, flex:'0 0 auto' }}>
                  <button className="mob-ham" onClick={() => setShowSidebar(s=>!s)} style={{ background:'transparent', border:'none', color:C.cream, cursor:'pointer', fontSize:20, padding:'0 2px', lineHeight:1, flexShrink:0 }}>☰</button>
                  <Avatar name={displayName(activeConv.telefono)} phone={activeConv.telefono} size={34} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:800, color:C.cream, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{displayName(activeConv.telefono)}</div>
                    <div style={{ fontSize:9, color:C.creamFaint }}>+{activeConv.telefono}</div>
                  </div>
                </div>
                <div className="chat-actions" style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', flex:1, justifyContent:'flex-end' }}>
                  {/* ── Eje 1: BANDEJA (estado de conversación) ── */}
                  {[
                    { s:'pendiente',    icon:'🔴', label:'Pendiente',  activeColor:'#f87171' },
                    { s:'atendido',     icon:'🟢', label:'Atendido',   activeColor:'#4ade80' },
                    { s:'soporte',      icon:'🎧', label:'Soporte',    activeColor:'#a78bfa' },
                    { s:'archivado',    icon:'⚫', label:'Archivar',   activeColor:C.creamDim },
                  ].map(({ s, icon, label, activeColor }) => (
                    <button key={s} onClick={() => changeStatus(activeConv.telefono, s)} title={label} style={{
                      padding:'4px 6px', fontWeight: currentStatusView===s ? 800 : 600, flexShrink:0,
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

                  {/* separador entre ejes */}
                  <span style={{ width:1, alignSelf:'stretch', background:C.border2, margin:'2px 2px', flexShrink:0 }} />

                  {/* ── Eje 2: TEMPERATURA del lead (manual, clic de nuevo = quitar) ── */}
                  {TEMPERATURAS.map(({ key, icon, label, color }) => {
                    const on = getTemp(activeConv.telefono) === key
                    return (
                      <button key={key} onClick={() => changeTemperatura(activeConv.telefono, key)}
                        title={on ? `${label} — clic para quitar` : `Marcar ${label}`} style={{
                          padding:'4px 6px', fontWeight: on ? 800 : 600, flexShrink:0,
                          background: on ? `${color}22` : 'transparent',
                          border: `${on ? 2 : 1}px solid ${on ? color : C.border2}`,
                          color: on ? color : C.creamFaint,
                          borderRadius:7, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                          boxShadow: on ? `0 0 8px ${color}44` : 'none',
                        }}>
                        <span className="hide-mobile" style={{ fontSize:10 }}>{icon} {label}</span>
                        <span className="show-mobile" style={{ fontSize:14 }}>{icon}</span>
                      </button>
                    )
                  })}
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
                      <MessageBubble msg={msg} allMsgs={activeConv.msgs} onResponder={responderA} />
                    </div>
                  )
                })}
                {enFila > 0 && (
                  <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
                    <div style={{ background:C.surface2, borderRadius:'18px 18px 4px 18px', padding:'9px 14px', border:`1px solid ${C.border2}` }}>
                      <span style={{ color:C.creamDim, fontSize:12, animation:'blink 1s infinite' }}>
                        {enFila > 1 ? `Enviando... (${enFila} en fila)` : 'Enviando...'}
                      </span>
                    </div>
                  </div>
                )}
                <Toast result={toast} />
                <div ref={endRef} />
              </div>

              {/* Input bar */}
              <div className="input-bar" style={{ position:'relative' }}>
                {!windowOpen && lastIncoming && (
                  <div style={{ marginBottom:8, padding:'7px 12px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', borderRadius:8, fontSize:11, color:'#fbbf24', display:'flex', alignItems:'center', justifyContent:'center', gap:10, flexWrap:'wrap' }}>
                    <span>⚠️ Ventana de 24h cerrada — solo plantilla</span>
                    <button onClick={() => setShowTplModal(true)} style={{ background:C.cream, border:'none', color:C.bg, fontWeight:800, fontSize:11, padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit' }}>📋 Enviar plantilla</button>
                  </div>
                )}
                {/* Aviso de los adjuntos: lo que se pegó no servía, o ya no cabe
                    más. Va acá arriba, pegado a la caja, porque es la respuesta a
                    un Ctrl+V que si no se queda mudo. */}
                {avisoAdjunto && (
                  <div style={{ marginBottom:8, padding:'7px 12px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.25)', borderRadius:8, fontSize:11, color:'#fbbf24', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ flex:1 }}>{avisoAdjunto}</span>
                    <button onClick={() => avisarAdjunto('')} title="Cerrar"
                      style={{ background:'transparent', border:'none', color:'#a16207', fontSize:13, cursor:'pointer', lineHeight:1, flexShrink:0 }}>✕</button>
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
                            ? imgResult.ok ? (isVideo ? '✓ video enviado' : `✓ ${imgFiles.length} enviada${imgFiles.length>1?'s':''}`) : `✗ ${imgResult.error || 'Error al enviar'}`
                            : isVideo ? '1 video seleccionado' : `${imgFiles.length} foto${imgFiles.length>1?'s':''} seleccionada${imgFiles.length>1?'s':''}`
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
                  <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display:'none' }} onChange={handleFileSelect} />

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
                    {/* Barra de cita: qué mensaje se está respondiendo. Con ✕ para soltarlo. */}
                    {citando && (
                      <div style={{
                        display:'flex', alignItems:'center', gap:8, marginBottom:8,
                        borderLeft:'3px solid #f59e0b', background:'rgba(0,0,0,.3)',
                        borderRadius:'0 8px 8px 0', padding:'5px 10px',
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#f59e0b' }}>
                            Respondiendo a {citando.direccion === 'SALIENTE' ? 'ti' : (activeConv?.nombre || citando.telefono)}
                          </div>
                          <div style={{ fontSize:11, color:C.creamDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {citando.mensaje || `[${citando.tipo || 'archivo'}]`}
                          </div>
                        </div>
                        <button onClick={() => setCitando(null)} title="Quitar la cita"
                          style={{ background:'transparent', border:'none', color:C.creamFaint, fontSize:15, cursor:'pointer', lineHeight:1, flexShrink:0 }}>✕</button>
                      </div>
                    )}
                    <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                      onPaste={handlePaste}
                      placeholder={getModoIA(activeConv?.telefono) ? '🤖 IA respondiendo automáticamente...' : 'Escribe un mensaje... (Ctrl+Enter para enviar)'}
                      rows={2}
                      style={{ width:'100%', background:'transparent', border:'none', outline:'none', color:C.cream, fontSize:14, resize:'none', lineHeight:1.5, minHeight:44, maxHeight:120, overflowY:'auto' }} />
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                    {(() => {
                      // UN SOLO botón: manda CON botones si el panel tiene botones; si no, solo texto.
                      const conBotones = showBtnPanel && btnTexts.some(t => t.trim())
                      // Ya NO se bloquea por tener envíos en curso: lo que se escriba
                      // ahora entra a la fila y sale después, en orden.
                      const busy = sendingBtns
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

                {/* Fila de herramientas, DEBAJO de la caja y pegada a la izquierda.
                    Antes iban al costado izquierdo del cuadro de texto y le comían
                    ancho justo donde se escribe. El ➤ de enviar NO baja acá: se
                    queda al costado derecho de la caja, que es donde la mano lo
                    busca. Igual que en WA INBOX V2. */}
                <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
                  <button onClick={() => fileRef.current?.click()} title="Adjuntar imagen o video — también puedes pegar con Ctrl+V o arrastrar la foto al chat"
                    style={{ width:42, height:42, flexShrink:0, background:imgFiles.length?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${imgFiles.length?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:17, display:'flex', alignItems:'center', justifyContent:'center', color:imgFiles.length?C.cream:C.creamDim, transition:'all .15s', position:'relative' }}>
                    📎
                    {imgFiles.length > 0 && <span style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', background:C.cream, color:C.bg, fontSize:8, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{imgFiles.length}</span>}
                  </button>
                  <button onClick={() => setShowBtnPanel(p=>!p)} title="Botones interactivos"
                    style={{ width:42, height:42, flexShrink:0, background:showBtnPanel?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${showBtnPanel?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', color:showBtnPanel?C.cream:C.creamDim, transition:'all .15s' }}>🔘</button>
                  <button onClick={() => { setShowEmoji(p=>!p); setShowBtnPanel(false) }} title="Emojis"
                    style={{ width:42, height:42, flexShrink:0, background:showEmoji?`rgba(244,241,236,.1)`:C.surface2, border:`1px solid ${showEmoji?'rgba(244,241,236,.3)':C.border}`, borderRadius:11, cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>😊</button>
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

          {/* RIGHT PANEL desktop — redimensionable */}
          {activeConv && (
            <div className="desktop-right" style={{ width: rightWidth, flexShrink:0, display:'flex', position:'relative' }}>
              {/* Asa de arrastre para ensanchar/adelgazar */}
              <div
                onMouseDown={startResize}
                onTouchStart={startResize}
                title="Arrastra para ajustar el ancho"
                style={{ width:6, flexShrink:0, cursor:'col-resize', background:C.border, borderLeft:`1px solid ${C.border2}`, transition:'background .15s', touchAction:'none' }}
                onMouseEnter={e => e.currentTarget.style.background = C.cream}
                onMouseLeave={e => e.currentTarget.style.background = C.border}
              />
              <div className="right-col" style={{ width:'auto', flex:1, borderLeft:'none' }}>
                <RightPanel activeConv={activeConv} contactInfo={currentContact} onQuickReply={handleQuickReply} onSendText={handleSendText} onSendImage={handleSendAIImage} onSendProducto={handleSendProducto} onUpdateContact={handleUpdateContact} windowOpen={windowOpen} onPedidoManual={alPedidoManualEscritorio} onVerPedido={alVerPedidoEscritorio} onEnviarHojaPedido={handleEnviarHojaPedido} />
              </div>
            </div>
          )}
          {showRight && activeConv && (
            <div className="right-col">
              <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 10px 0' }}>
                <button onClick={cerrarCajonDerecho} style={{ background:'transparent', border:'none', color:C.creamFaint, cursor:'pointer', fontSize:17 }}>✕</button>
              </div>
              <RightPanel activeConv={activeConv} contactInfo={currentContact} onQuickReply={handleQuickReply} onSendText={handleSendText} onSendImage={handleSendAIImage} onSendProducto={handleSendProducto} onUpdateContact={handleUpdateContact} windowOpen={windowOpen} onPedidoManual={alPedidoManualCajon} onVerPedido={alVerPedidoCajon} onEnviarHojaPedido={handleEnviarHojaPedido} />
            </div>
          )}

        </div>{/* fin app-shell */}

        {/* ══════ CONTACTOS ══════ */}
        {vista === 'CONTACTOS' && (
          <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
            <Contactos active={vista==='CONTACTOS'} onOpenChat={abrirChatDesdeContactos} />
          </div>
        )}
        {/* ══════ AUTOMATIZACIONES ══════ */}
        {vista === 'AUTO' && (
          <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
            <Automatizaciones active={vista==='AUTO'} />
          </div>
        )}
      </div>

      {/* Modal de plantilla desde el chat (ventana de 24h cerrada) */}
      {showTplModal && activeConv && (
        <PlantillaModal
          telefono={activeConv.telefono}
          nombre={activeConv.nombre}
          onClose={() => setShowTplModal(false)}
          flash={(m) => { setTplToast(m); setTimeout(() => setTplToast(null), 3000) }}
        />
      )}
      {tplToast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:C.surface2, border:`1px solid ${C.border2}`, color:C.cream, padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:700, zIndex:600, boxShadow:'0 8px 30px rgba(0,0,0,.6)', maxWidth:'86vw', textAlign:'center' }}>{tplToast}</div>
      )}
    </>
  )
}
