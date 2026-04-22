'use client'

import Link from 'next/link'
import { useNetworkStatus } from '@/lib/network'

type BannerConfig = {
  bg: string
  text: string
  action?: React.ReactNode
}

export function NetworkBanner() {
  const { status, lastChecked: _ } = useNetworkStatus()

  if (status === 'online') return null

  const configs: Record<Exclude<typeof status, 'online'>, BannerConfig> = {
    offline: {
      bg: 'bg-zinc-900',
      text: 'Offline. Recordings will upload when you reconnect.',
    },
    'api-unreachable': {
      bg: 'bg-zinc-900',
      text: "Can't reach Anvil's servers. Retrying\u2026",
      action: <RetryButton />,
    },
    'auth-expired': {
      bg: 'bg-amber-900',
      text: 'Session expired.',
      action: (
        <Link href="/login" className="ml-2 underline underline-offset-2 text-white text-xs font-medium">
          Sign in
        </Link>
      ),
    },
    'rate-limited': {
      bg: 'bg-zinc-900',
      text: 'Anvil is catching up. New findings will appear shortly.',
    },
  }

  const config = configs[status]

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex h-8 w-full items-center justify-center px-4 text-xs text-white ${config.bg}`}
    >
      <span>{config.text}</span>
      {config.action}
    </div>
  )
}

function RetryButton() {
  function handleClick() {
    window.dispatchEvent(new Event('online'))
  }

  return (
    <button
      onClick={handleClick}
      className="ml-2 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-white/30 hover:bg-white/10 transition-colors"
    >
      Retry
    </button>
  )
}
