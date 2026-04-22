'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type NetworkStatus = 'online' | 'offline' | 'api-unreachable' | 'auth-expired' | 'rate-limited'

export function isOnline(status: NetworkStatus): boolean {
  return status === 'online'
}

const POLL_INTERVAL_MS = 15_000

function getHealthUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ''
  return `${base}/health`
}

async function pollHealth(): Promise<NetworkStatus> {
  if (!navigator.onLine) return 'offline'

  try {
    const res = await fetch(getHealthUrl(), { method: 'GET', cache: 'no-store' })
    if (res.ok) return 'online'
    if (res.status === 401 || res.status === 403) return 'auth-expired'
    if (res.status === 429) return 'rate-limited'
    return 'api-unreachable'
  } catch {
    return navigator.onLine ? 'api-unreachable' : 'offline'
  }
}

export function useNetworkStatus(): { status: NetworkStatus; lastChecked: Date | null } {
  const [status, setStatus] = useState<NetworkStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  )
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    const next = await pollHealth()
    setStatus(next)
    setLastChecked(new Date())
  }, [])

  useEffect(() => {
    const onOnline = () => { check() }
    const onOffline = () => { setStatus('offline'); setLastChecked(new Date()) }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Initial probe on mount. Async + kicks off state updates — that's the
    // point. The lint rule flags any setState chain originating from an
    // effect body, which doesn't apply cleanly to async bootstrapping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check()

    intervalRef.current = setInterval(check, POLL_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [check])

  return { status, lastChecked }
}
