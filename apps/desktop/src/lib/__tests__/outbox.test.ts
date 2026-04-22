import { describe, it, expect, vi, beforeEach } from 'vitest'

const idbStore: Record<string, unknown> = {}

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => idbStore[k]),
  set: vi.fn(async (k: string, v: unknown) => { idbStore[k] = v }),
  del: vi.fn(async (k: string) => { delete idbStore[k] }),
  keys: vi.fn(async () => Object.keys(idbStore)),
}))

import { enqueue, dequeue, getAll, markFailed, useOutbox } from '@/lib/outbox'
import { renderHook, act, waitFor } from '@testing-library/react'

beforeEach(() => {
  for (const k of Object.keys(idbStore)) delete idbStore[k]
  vi.stubGlobal('fetch', vi.fn())
})

describe('outbox', () => {
  it('enqueue adds entry to IDB', async () => {
    const entry = await enqueue({ type: 'mutation', payload: { endpoint: '/api/test', method: 'POST', body: {} }, projectId: 'p1' })
    expect(entry.id).toBeTruthy()
    expect(entry.attempts).toBe(0)
    expect(entry.lastError).toBeNull()

    const all = await getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(entry.id)
  })

  it('dequeue removes entry', async () => {
    const entry = await enqueue({ type: 'mutation', payload: {}, projectId: 'p1' })
    await dequeue(entry.id)
    const all = await getAll()
    expect(all).toHaveLength(0)
  })

  it('replay calls fetch for mutation entries and removes on success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    await enqueue({ type: 'mutation', payload: { endpoint: '/api/foo', method: 'POST', body: { x: 1 } }, projectId: 'p1' })

    const { result } = renderHook(() => useOutbox())
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    await act(async () => { await result.current.replay() })

    expect(fetch).toHaveBeenCalledOnce()
    expect(result.current.entries).toHaveLength(0)
  })

  it('markFailed increments attempts and sets lastError', async () => {
    const entry = await enqueue({ type: 'mutation', payload: {}, projectId: 'p1' })
    await markFailed(entry.id, 'timeout')

    const all = await getAll()
    expect(all[0].attempts).toBe(1)
    expect(all[0].lastError).toBe('timeout')
  })

  it('clearFailed removes entries with attempts >= 3', async () => {
    const a = await enqueue({ type: 'mutation', payload: {}, projectId: 'p1' })
    const b = await enqueue({ type: 'mutation', payload: {}, projectId: 'p1' })

    await markFailed(a.id, 'err')
    await markFailed(a.id, 'err')
    await markFailed(a.id, 'err')

    const { result } = renderHook(() => useOutbox())
    await waitFor(() => expect(result.current.entries).toHaveLength(2))

    await act(async () => { await result.current.clearFailed() })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].id).toBe(b.id)
  })
})
