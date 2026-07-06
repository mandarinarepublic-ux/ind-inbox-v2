export const metadata = {
  title: 'IND Inbox — IND Store',
  description: 'WhatsApp CRM para IND Store',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
