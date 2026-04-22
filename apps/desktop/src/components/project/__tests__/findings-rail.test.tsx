import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { AnalystDocument, Persona } from '@/lib/supabase/types'

// Mock hooks
vi.mock('@/lib/hooks/use-projects', () => ({
  useAnalystDocument: vi.fn(),
  usePersonas: vi.fn(),
}))

vi.mock('@/lib/hooks/use-interviews', () => ({
  useInterviews: vi.fn(() => ({
    data: { interviews: [{ id: 'i1' }, { id: 'i2' }] },
  })),
}))

vi.mock('@/components/error-card', () => ({
  ErrorCard: ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
    <div data-testid="error-card">
      {error?.message}
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const makeAnalystDoc = (overrides: Partial<AnalystDocument> = {}): AnalystDocument => ({
  id: 'doc-1',
  project_id: 'proj-1',
  content: {},
  pain_points: [],
  patterns: [],
  key_quotes: [],
  customer_language: [],
  saturation_score: 0,
  interview_count: 2,
  unique_pattern_count: 0,
  updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
  ...overrides,
})

const makePersona = (overrides: Partial<Persona> = {}): Persona => ({
  id: 'p-' + Math.random(),
  project_id: 'proj-1',
  name: 'Finance Leader',
  description: 'Owns the close',
  job_titles: ['CFO'],
  pain_points: ['Manual close'],
  status: 'suggested',
  created_at: new Date().toISOString(),
  ...overrides,
})

describe('FindingsRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders pain points list from analyst document', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeAnalystDoc({
        pain_points: [
          { title: 'Manual reconciliation', severity: 'high', count: 4 },
          { title: 'Tool sprawl', severity: 'medium', count: 3 },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(screen.getByText('Manual reconciliation')).toBeDefined()
    expect(screen.getByText('Tool sprawl')).toBeDefined()
    expect(screen.getByText('×4')).toBeDefined()
    expect(screen.getByText('×3')).toBeDefined()
  })

  it('renders suggested personas with Edit link', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeAnalystDoc(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [makePersona({ name: 'Lean Finance Lead', status: 'suggested' })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(screen.getByText('Lean Finance Lead')).toBeDefined()
    expect(screen.getByText('Edit →')).toBeDefined()
  })

  it('renders confirmed personas without Edit link', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeAnalystDoc(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [makePersona({ name: 'Platform Operator', status: 'confirmed' })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(screen.getByText('Platform Operator')).toBeDefined()
    expect(screen.queryByText('Edit →')).toBeNull()
  })

  it('shows pain point severity as Pill (high=indigo label)', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeAnalystDoc({
        pain_points: [{ title: 'Big problem', severity: 'high', count: 5 }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    // The Pill for high severity should render the text 'high'
    expect(screen.getByText('high')).toBeDefined()
  })

  it('renders empty state when no analyst doc and fewer than 2 interviews', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [{ id: 'i1' }] }, // only 1 interview
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(
      screen.getByText('Complete 2 interviews to unlock findings.')
    ).toBeDefined()
  })

  it('renders customer language chips when present', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeAnalystDoc({
        customer_language: ['manual close', 'spreadsheet hell', 'source of truth'],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(screen.getByText('manual close')).toBeDefined()
    expect(screen.getByText('spreadsheet hell')).toBeDefined()
    expect(screen.getByText('source of truth')).toBeDefined()
  })

  it('renders error card when analyst doc fetch fails', async () => {
    const { useAnalystDocument, usePersonas } = await import('@/lib/hooks/use-projects')
    ;(useAnalystDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Fetch failed'),
      refetch: vi.fn(),
    })
    ;(usePersonas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { FindingsRail } = await import('../findings-rail')
    render(<FindingsRail projectId="proj-1" />)

    expect(screen.getByTestId('error-card')).toBeDefined()
  })
})
