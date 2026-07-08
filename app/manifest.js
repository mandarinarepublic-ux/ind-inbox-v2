// Manifest PWA — permite instalar IND Inbox como app en el celular.
export default function manifest() {
  return {
    name: 'INDLOVERS CHAT — IND Store',
    short_name: 'INDLOVERS',
    description: 'WhatsApp CRM para IND Store',
    start_url: '/inbox',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
