'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Link as LinkIcon, ChevronLeft, MapPin, Video } from 'lucide-react'
import {
  useCreateInterview,
  useDeleteInterview,
  useInterviews,
} from '@/lib/hooks/use-interviews'
import { useProject } from '@/lib/hooks/use-projects'
import type { Interview } from '@/lib/supabase/types'
import { LiveDot } from './live-dot'
import { SourceGlyph } from './source-glyph'
import { ErrorCard } from '@/components/error-card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ConversationMode = 'in_person' | 'online'

type InterviewInboxProps = {
  projectId: string
  activeInterviewId?: string
  onSelect: (id: string) => void
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isWithinDays(d: Date, days: number): boolean {
  const now = new Date()
  const diff = Math.abs(d.getTime() - now.getTime())
  return diff < days * 24 * 60 * 60 * 1000
}

function formatTime(scheduledAt: string | null, status: Interview['status']): string {
  if (status === 'live') return 'Now'
  if (!scheduledAt) return '—'
  try {
    const d = new Date(scheduledAt)
    if (isNaN(d.getTime())) return '—'
    const now = new Date()
    if (isSameDay(d, now)) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function groupInterviewsBySection(interviews: Interview[]) {
  const today: Interview[] = []
  const thisWeek: Interview[] = []
  const processed: Interview[] = []

  const now = new Date()

  for (const interview of interviews) {
    if (interview.status === 'completed') {
      processed.push(interview)
      continue
    }
    if (interview.status === 'live') {
      today.push(interview)
      continue
    }
    const scheduledAt = interview.scheduled_at
    if (!scheduledAt) {
      thisWeek.push(interview)
      continue
    }
    try {
      const d = new Date(scheduledAt)
      if (isNaN(d.getTime())) {
        thisWeek.push(interview)
        continue
      }
      if (isSameDay(d, now)) {
        today.push(interview)
      } else if (isWithinDays(d, 7)) {
        thisWeek.push(interview)
      } else {
        processed.push(interview)
      }
    } catch {
      thisWeek.push(interview)
    }
  }

  return { today, thisWeek, processed }
}

function SkeletonRow() {
  return (
    <div className="px-[18px] py-2.5 flex gap-2.5 items-center animate-pulse">
      <div className="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/2" />
      </div>
    </div>
  )
}

type AddInterviewDrawerProps = {
  projectId: string
  onCancel: () => void
}

function AddInterviewDrawer({ projectId, onCancel }: AddInterviewDrawerProps) {
  const [mode, setMode] = useState<ConversationMode>('in_person')
  const [meetLink, setMeetLink] = useState('')
  const [location, setLocation] = useState('')
  const [attendeeName, setAttendeeName] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const createInterview = useCreateInterview()
  // Synchronous double-submit guard. `disabled={isPending}` alone is not
  // enough: a synchronous double-click fires both handlers before React
  // re-renders with isPending=true, producing two inserts.
  const submittingRef = useRef(false)

  const handleSubmit = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    const isOnline = mode === 'online'
    createInterview.mutate(
      {
        projectId,
        personaId: null,
        source: isOnline ? 'meet_link' : 'inperson',
        meetingPlatform: isOnline ? 'google_meet' : null,
        // For in-person we stash the location string in `meeting_link` so
        // the canvas can surface it without a schema change. The column
        // is just `text`, not URL-validated.
        meetingLink: isOnline ? (meetLink || null) : (location || null),
        attendeeName: attendeeName || null,
        attendeeCompany: null,
        scheduledAt: scheduledTime || null,
      },
      {
        onSuccess: onCancel,
        onSettled: () => { submittingRef.current = false },
      }
    )
  }

  return (
    <div className="px-3.5 py-3 border-b border-border bg-muted/30">
      <div className="anvil-caps mb-2">Add conversation</div>

      {/* Modality toggle */}
      <div
        role="tablist"
        aria-label="Conversation type"
        className="grid grid-cols-2 gap-0.5 p-0.5 mb-2 bg-muted rounded-md"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'in_person'}
          onClick={() => setMode('in_person')}
          className={cn(
            'h-6 inline-flex items-center justify-center gap-1 rounded text-[11px] tracking-[-0.005em] transition-colors',
            mode === 'in_person'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MapPin className="w-3 h-3" />
          In person
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'online'}
          onClick={() => setMode('online')}
          className={cn(
            'h-6 inline-flex items-center justify-center gap-1 rounded text-[11px] tracking-[-0.005em] transition-colors',
            mode === 'online'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Video className="w-3 h-3" />
          Online
        </button>
      </div>

      {/* Mode-specific input: meet link OR location */}
      {mode === 'online' ? (
        <div className="relative mb-2">
          <LinkIcon className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
          <input
            type="url"
            placeholder="https://meet.google.com/..."
            value={meetLink}
            onChange={(e) => setMeetLink(e.target.value)}
            className="w-full h-8 pl-7 pr-2.5 text-[12px] bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>
      ) : (
        <div className="relative mb-2">
          <MapPin className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Location (optional) — e.g. Sightglass on Mission"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-8 pl-7 pr-2.5 text-[12px] bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <input
          type="text"
          placeholder="Attendee name"
          value={attendeeName}
          onChange={(e) => setAttendeeName(e.target.value)}
          className="h-7 px-2 text-[12px] bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="text"
          placeholder="Tue 4:30 PM"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          className="h-7 px-2 text-[12px] bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex gap-1.5 mb-2">
        <Button
          size="sm"
          className="flex-1 h-7 text-[11px]"
          onClick={handleSubmit}
          disabled={createInterview.isPending}
        >
          {mode === 'online' ? 'Anvil will join the call' : 'Schedule conversation'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {createInterview.error &&
        (createInterview.error as { code?: string }).code === 'PLAN_LIMIT' ? (
        <div
          role="alert"
          data-testid="plan-limit-banner"
          className="mb-2 rounded-md border border-amber-300/50 bg-amber-50 p-2 text-[11px] text-amber-900"
        >
          {(createInterview.error as Error).message}{' '}
          <a href="/billing" className="underline underline-offset-2">
            Upgrade →
          </a>
        </div>
      ) : null}
      <div className="text-[11px] text-muted-foreground leading-snug">
        {mode === 'online'
          ? 'A live transcript will stream into the conversation page once the call starts.'
          : 'Open the conversation page during your meeting — the live transcript will stream in as you speak.'}
      </div>
      <div className="flex gap-2.5 text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/60">
        <button className="hover:text-foreground transition-colors cursor-pointer">
          ↑ Upload recording
        </button>
        <button className="hover:text-foreground transition-colors cursor-pointer">
          ↑ Paste transcript
        </button>
      </div>
    </div>
  )
}

type InterviewRowProps = {
  interview: Interview
  isActive: boolean
  onClick: () => void
  projectId: string
}

function InterviewRow({ interview, isActive, onClick, projectId }: InterviewRowProps) {
  const isLive = interview.status === 'live'
  const timeStr = formatTime(interview.scheduled_at, interview.status)
  const deleteInterview = useDeleteInterview()

  return (
    <div
      onClick={onClick}
      className={cn(
        'group px-[18px] py-2.5 flex gap-2.5 cursor-pointer transition-colors',
        isActive ? 'bg-muted/50' : 'hover:bg-muted/20',
      )}
      style={{
        borderLeft: isActive ? '2px solid var(--color-rose)' : '2px solid transparent',
      }}
    >
      <div className="shrink-0 mt-[7px]">
        {isLive ? (
          <LiveDot size="sm" color="rose" />
        ) : (
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              interview.status === 'scheduled'
                ? 'bg-[var(--color-azure)]'
                : 'bg-muted-foreground'
            )}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-[13.5px] tracking-[-0.005em] truncate',
            isActive ? 'font-medium' : 'font-normal'
          )}
        >
          {interview.attendee_name ?? 'Unknown attendee'}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span className="truncate">
            {interview.attendee_company ?? ''}
          </span>
          {interview.attendee_company && (
            <span className="text-border">·</span>
          )}
          <SourceGlyph source={interview.source} />
        </div>
      </div>
      <div
        className={cn(
          'text-[11px] shrink-0 flex items-center gap-1',
          isLive ? 'text-[var(--color-rose)]' : 'text-muted-foreground'
        )}
      >
        {isLive && <LiveDot size="sm" color="rose" />}
        {timeStr}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="interview-row-kebab"
          aria-label="Conversation actions"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100 text-muted-foreground hover:text-foreground transition-opacity px-1 cursor-pointer"
        >
          ⋮
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            data-testid="interview-row-delete"
            variant="destructive"
            disabled={deleteInterview.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (
                window.confirm(
                  `Delete this conversation${interview.attendee_name ? ` with ${interview.attendee_name}` : ''}? This cannot be undone.`,
                )
              ) {
                deleteInterview.mutate({ id: interview.id, projectId })
              }
            }}
          >
            Delete conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function InterviewInbox({
  projectId,
  activeInterviewId,
  onSelect,
}: InterviewInboxProps) {
  const [addOpen, setAddOpen] = useState(false)
  const { data, isLoading, isError, error, refetch } = useInterviews(projectId)
  const { data: project } = useProject(projectId)

  const interviews = data?.interviews ?? []
  const { today, thisWeek, processed } = groupInterviewsBySection(interviews)

  const doneCount = interviews.filter((i: Interview) => i.status === 'completed').length
  const upcomingCount = interviews.filter((i: Interview) => i.status === 'scheduled').length

  const sections = [
    { heading: 'Today', rows: today },
    { heading: 'This week', rows: thisWeek },
    { heading: 'Processed', rows: processed },
  ].filter((s) => s.rows.length > 0)

  return (
    <aside className="flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-[18px] py-[18px] pb-3.5 border-b border-border">
        <Link
          href="/dashboard"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5 mb-1.5 -ml-1"
        >
          <ChevronLeft className="w-3 h-3" />
          All projects
        </Link>
        <div className="font-semibold text-[15px] tracking-[-0.02em]">
          {project?.name ?? 'Loading…'}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {doneCount} done · {upcomingCount} upcoming
        </div>
      </div>

      {/* Add interview affordance */}
      {addOpen ? (
        <AddInterviewDrawer
          projectId={projectId}
          onCancel={() => setAddOpen(false)}
        />
      ) : (
        <div className="px-3.5 py-2.5 border-b border-border">
          <button
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 bg-transparent text-muted-foreground border border-dashed border-border rounded-[7px] text-[12.5px] tracking-[-0.005em] cursor-pointer hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            Add conversation
            <span className="flex-1" />
            <span className="anvil-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-[3px]">
              ⌘N
            </span>
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto py-2">
        {isLoading && (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        )}

        {isError && (
          <div className="px-3.5 py-2">
            <ErrorCard error={error as Error} onRetry={() => refetch()} />
          </div>
        )}

        {!isLoading && !isError && interviews.length === 0 && (
          <div className="px-[18px] py-4 text-[12px] text-muted-foreground leading-snug">
            No conversations yet. Add an in-person or online conversation to
            start capturing a live transcript.
          </div>
        )}

        {!isLoading &&
          !isError &&
          sections.map((section) => (
            <div key={section.heading}>
              <div className="anvil-caps px-[18px] pt-3.5 pb-2">
                {section.heading}
              </div>
              {section.rows.map((interview) => (
                <InterviewRow
                  key={interview.id}
                  interview={interview}
                  isActive={interview.id === activeInterviewId}
                  onClick={() => onSelect(interview.id)}
                  projectId={projectId}
                />
              ))}
            </div>
          ))}
      </div>
    </aside>
  )
}
