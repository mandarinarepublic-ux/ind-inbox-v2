import PwaRegister from './pwa-register'

export const metadata = {
  title: 'INDLOVERS CHAT — IND Store',
  description: 'WhatsApp CRM para IND Store',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'INDLOVERS',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0 }}>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
