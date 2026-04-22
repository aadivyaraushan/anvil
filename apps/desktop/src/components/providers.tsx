'use client'

import { QueryProvider } from '@/providers/query-provider'
import { NetworkBanner } from '@/components/network-banner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <NetworkBanner />
      {children}
    </QueryProvider>
  )
}
