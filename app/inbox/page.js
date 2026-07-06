'use client'
import nextDynamic from 'next/dynamic'

const App = nextDynamic(() => import('@/components/App'), { ssr: false })

export default function InboxPage() {
  return <App />
}
