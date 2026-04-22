'use client'

import { get, set, del, keys } from 'idb-keyval'
import { useState, useEffect, useCallback } from 'react'

export type OutboxEntry = {
  id: string
  type: 'mutation' | 'upload-recording'
  payload: unknown
  attempts: number
  lastError: string | null
  createdAt: string
  projectId: string
}

const IDB_PREFIX = 'outbox:'

function entryKey(id: string): string {
  return `${IDB_PREFIX}${id}`
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function enqueue(
  entry: Omit<OutboxEntry, 'id' | 'attempts' | 'lastError' | 'createdAt'>
): Promise<OutboxEntry> {
  const full: OutboxEntry = {
    ...entry,
    id: uuid(),
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  }
  await set(entryKey(full.id), full)
  return full
}

export async function dequeue(id: string): Promise<void> {
  await del(entryKey(id))
}

export async function getAll(): Promise<OutboxEntry[]> {
  const allKeys = await keys()
  const outboxKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_PREFIX))
  const entries = await Promise.all(outboxKeys.map((k) => get<OutboxEntry>(k)))
  return (entries.filter(Boolean) as OutboxEntry[]).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

export async function markFailed(id: string, error: string): Promise<void> {
  const entry = await get<OutboxEntry>(entryKey(id))
  if (!entry) return
  await set(entryKey(id), { ...entry, attempts: entry.attempts + 1, lastError: error })
}

async function replayEntry(entry: OutboxEntry): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ''

  if (entry.type === 'mutation') {
    const { endpoint, method, body } = entry.payload as {
      endpoint: string
      method: string
      body: unknown
    }
    const res = await fetch(`${base}${endpoint}`, {
      method: method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return
  }

  if (entry.type === 'upload-recording') {
    const { endpoint, formData } = entry.payload as {
      endpoint: string
      formData: Record<string, string>
    }
    const fd = new FormData()
    for (const [k, v] of Object.entries(formData)) fd.append(k, v)
    const res = await fetch(`${base}${endpoint}`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return
  }
}

export function useOutbox(): {
  entries: OutboxEntry[]
  replay: () => Promise<void>
  clearFailed: () => Promise<void>
} {
  const [entries, setEntries] = useState<OutboxEntry[]>([])

  const refresh = useCallback(async () => {
    setEntries(await getAll())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const replay = useCallback(async () => {
    const current = await getAll()
    await Promise.allSettled(
      current.map(async (entry) => {
        try {
          await replayEntry(entry)
          await dequeue(entry.id)
        } catch (err) {
          await markFailed(entry.id, err instanceof Error ? err.message : String(err))
        }
      })
    )
    await refresh()
  }, [refresh])

  const clearFailed = useCallback(async () => {
    const current = await getAll()
    await Promise.all(
      current.filter((e) => e.attempts >= 3).map((e) => dequeue(e.id))
    )
    await refresh()
  }, [refresh])

  return { entries, replay, clearFailed }
}
