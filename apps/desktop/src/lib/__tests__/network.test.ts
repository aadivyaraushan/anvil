import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNetworkStatus } from '@/lib/network'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNetworkStatus', () => {
  it('reports online when the health probe returns 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => expect(result.current.status).toBe('online'))
  })

  it('re-polls on window offline event and reflects the probe result', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    const { result } = renderHook(() => useNetworkStatus())
    await waitFor(() => expect(result.current.status).toBe('online'))

    // Simulate connectivity loss: subsequent fetches throw.
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    await waitFor(() => expect(result.current.status).toBe('api-unreachable'))
  })

  it('transitions to api-unreachable when health poll returns non-ok', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => expect(result.current.status).toBe('api-unreachable'))
  })
})
