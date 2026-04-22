import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNetworkStatus } from '@/lib/network'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  setOnline(true)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNetworkStatus', () => {
  it('starts as online when navigator.onLine is true', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => expect(result.current.status).toBe('online'))
  })

  it('transitions to offline on window offline event', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => expect(result.current.status).toBe('online'))

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.status).toBe('offline')
  })

  it('transitions to api-unreachable when health poll returns non-ok', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => expect(result.current.status).toBe('api-unreachable'))
  })
})
