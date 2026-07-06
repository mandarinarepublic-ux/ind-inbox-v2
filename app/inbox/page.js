'use client'
export const dynamic = 'force-dynamic'
import dynamic from 'next/dynamic'

const App = dynamic(() => import('@/components/App'), { ssr: false })

export default function InboxPage() {
  return <App />
}
