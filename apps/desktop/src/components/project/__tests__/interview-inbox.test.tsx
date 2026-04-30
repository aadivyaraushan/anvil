import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { Interview } from '@/lib/supabase/types'

// Mock the hooks
vi.mock('@/lib/hooks/use-interviews', () => ({
  useInterviews: vi.fn(),
  useCreateInterview: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  // PR 3 added a kebab menu on each interview row that calls
  // useDeleteInterview. The mock needs to surface it so the inbox
  // renders without "no export" errors during unit tests.
  useDeleteInterview: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/lib/hooks/use-projects', () => ({
  useProject: vi.fn(() => ({ data: { name: 'Finops research' } })),
}))

vi.mock('@/components/error-card', () => ({
  ErrorCard: ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
    <div data-testid="error-card">
      {error?.message}
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="icon-plus" />,
  Link: () => <span data-testid="icon-link" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  MapPin: () => <span data-testid="icon-map-pin" />,
  Video: () => <span data-testid="icon-video" />,
  // Dialog (used by the new conversation-delete confirm) renders an XIcon
  // close button. Stub it so the menu/dialog tree mounts in tests.
  XIcon: () => <span data-testid="icon-x" />,
  CheckIcon: () => <span data-testid="icon-check" />,
  ChevronRightIcon: () => <span data-testid="icon-chevron-right" />,
}))

const makeInterview = (overrides: Partial<Interview> = {}): Interview => ({
  id: 'i-' + Math.random(),
  project_id: 'proj-1',
  persona_id: null,
  source: 'desktop',
  meeting_platform: null,
  meeting_link: null,
  attendee_name: 'Alice Johnson',
  attendee_company: 'Acme Corp',
  scheduled_at: null,
  status: 'scheduled',
  transcript: [],
  suggested_questions: [],
  duration_seconds: null,
  recording_path: null,
  upload_status: 'none',
  created_at: new Date().toISOString(),
  ...overrides,
})

describe('InterviewInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 3 skeleton rows when loading', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    const { container } = render(
      <InterviewInbox projectId="proj-1" onSelect={vi.fn()} />
    )

    // Skeletons use animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  it('renders empty state when no interviews', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [], grouped: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    render(<InterviewInbox projectId="proj-1" onSelect={vi.fn()} />)

    expect(screen.getByText(/No conversations yet/i)).toBeDefined()
  })

  it('renders error card on error', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    render(<InterviewInbox projectId="proj-1" onSelect={vi.fn()} />)

    expect(screen.getByTestId('error-card')).toBeDefined()
  })

  it('renders "Today" section for interviews scheduled today', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    const todayInterview = makeInterview({
      id: 'today-1',
      attendee_name: 'Today Person',
      scheduled_at: new Date().toISOString(),
      status: 'scheduled',
    })
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [todayInterview], grouped: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    render(<InterviewInbox projectId="proj-1" onSelect={vi.fn()} />)

    expect(screen.getByText('Today')).toBeDefined()
    expect(screen.getByText('Today Person')).toBeDefined()
  })

  it('renders "Processed" section for completed interviews', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    const completedInterview = makeInterview({
      id: 'done-1',
      attendee_name: 'Mia Torres',
      status: 'completed',
    })
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [completedInterview], grouped: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    render(<InterviewInbox projectId="proj-1" onSelect={vi.fn()} />)

    expect(screen.getByText('Processed')).toBeDefined()
    expect(screen.getByText('Mia Torres')).toBeDefined()
  })

  it('active interview row has rose border indicator', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    const interview = makeInterview({ id: 'active-1', attendee_name: 'Active Person' })
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [interview], grouped: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    const { container } = render(
      <InterviewInbox
        projectId="proj-1"
        activeInterviewId="active-1"
        onSelect={vi.fn()}
      />
    )

    // The active row should have the rose border style
    const rows = container.querySelectorAll('[style*="color-rose"]')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('renders project name in header', async () => {
    const { useInterviews } = await import('@/lib/hooks/use-interviews')
    ;(useInterviews as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { interviews: [], grouped: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { InterviewInbox } = await import('../interview-inbox')
    render(<InterviewInbox projectId="proj-1" onSelect={vi.fn()} />)

    expect(screen.getByText('Finops research')).toBeDefined()
  })
})
