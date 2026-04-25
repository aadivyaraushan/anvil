import { describe, it, expect } from 'vitest'
import { mapError, ErrorCode, AnvilError } from '@/lib/errors'

describe('mapError', () => {
  it('maps TypeError (fetch failed) to OFFLINE', () => {
    const err = new TypeError('Failed to fetch')
    expect(mapError(err).code).toBe(ErrorCode.OFFLINE)
  })

  it('maps Response 401 to AUTH_EXPIRED', () => {
    const res = new Response(null, { status: 401 })
    expect(mapError(res).code).toBe(ErrorCode.AUTH_EXPIRED)
  })

  it('maps Response 429 to RATE_LIMITED', () => {
    const res = new Response(null, { status: 429 })
    expect(mapError(res).code).toBe(ErrorCode.RATE_LIMITED)
  })

  it('maps Response 503 to API_UNREACHABLE', () => {
    const res = new Response(null, { status: 503 })
    expect(mapError(res).code).toBe(ErrorCode.SERVER_ERROR)
  })

  it('maps Response 404 to NOT_FOUND', () => {
    const res = new Response(null, { status: 404 })
    expect(mapError(res).code).toBe(ErrorCode.NOT_FOUND)
  })

  it('maps Response 500 to SERVER_ERROR', () => {
    const res = new Response(null, { status: 500 })
    expect(mapError(res).code).toBe(ErrorCode.SERVER_ERROR)
  })

  it('maps unknown to UNKNOWN', () => {
    expect(mapError('something random').code).toBe(ErrorCode.UNKNOWN)
    expect(mapError(42).code).toBe(ErrorCode.UNKNOWN)
    expect(mapError(null).code).toBe(ErrorCode.UNKNOWN)
  })

  it('returns AnvilError as-is', () => {
    const original = new AnvilError(ErrorCode.NOT_FOUND)
    expect(mapError(original)).toBe(original)
  })

  it('surfaces the server message for uncategorized 4xx (e.g. Supabase 400)', () => {
    const supabaseAuthError = Object.assign(new Error('Invalid login credentials'), {
      status: 400,
    })
    const mapped = mapError(supabaseAuthError)
    expect(mapped.code).toBe(ErrorCode.UNKNOWN)
    expect(mapped.userMessage).toBe('Invalid login credentials')
  })

  it('truncates very long passthrough messages', () => {
    const longMsg = 'x'.repeat(500)
    const err = Object.assign(new Error(longMsg), { status: 422 })
    const mapped = mapError(err)
    expect(mapped.userMessage.length).toBeLessThanOrEqual(201)
    expect(mapped.userMessage.endsWith('…')).toBe(true)
  })

  it('keeps generic copy for 4xx with no usable message', () => {
    const err = Object.assign(new Error(''), { status: 418 })
    const mapped = mapError(err)
    expect(mapped.userMessage).toBe('An unexpected error occurred.')
  })

  it('does not pass through 5xx server messages', () => {
    const err = Object.assign(new Error('Database exploded: connection pool exhausted at line 42'), {
      status: 500,
    })
    const mapped = mapError(err)
    expect(mapped.code).toBe(ErrorCode.SERVER_ERROR)
    expect(mapped.userMessage).toBe("Something went wrong on our end. We're looking into it.")
  })
})
