'use client'

import { useState } from 'react'
import { Plus, Link as LinkIcon } from 'lucide-react'
import { useInterviews } from '@/lib/hooks/use-interviews'
import { useProject } from '@/lib/hooks/use-projects'
import { useCreateInterview } from '@/lib/hooks/use-interviews'
import type { Interview } from '@/lib/supabase/types'
import { LiveDot } from './live-dot'
import { SourceGlyph } from './source-glyph'
import { ErrorCard } from '@/components/error-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  const [meetLink, setMeetLink] = useState('')
  const [attendeeName, setAttendeeName] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const createInterview = useCreateInterview()

  const handleSubmit = () => {
    createInterview.mutate(
      {
        projectId,
        personaId: null,
        source: 'meet_link',
        meetingPlatform: 'google_meet',
        meetingLink: meetLink || null,
        attendeeName: attendeeName || null,
        attendeeCompany: null,
        scheduledAt: scheduledTime || null,
      },
      { onSuccess: onCancel }
    )
  }

  return (
    <div className="px-3.5 py-3 border-b border-border bg-muted/30">
      <div className="anvil-caps mb-2">Add interview</div>
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
          Anvil will join
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
      <div className="flex gap-2.5 text-[11px] text-muted-foreground">
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
}

function InterviewRow({ interview, isActive, onClick }: InterviewRowProps) {
  const isLive = interview.status === 'live'
  const timeStr = formatTime(interview.scheduled_at, interview.status)

  return (
    <div
      onClick={onClick}
      className={cn(
        'px-[18px] py-2.5 flex gap-2.5 cursor-pointer transition-colors',
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
            Add interview
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
          <div className="px-[18px] py-4 text-[12px] text-muted-foreground">
            No interviews yet.
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
                />
              ))}
            </div>
          ))}
      </div>
    </aside>
  )
}
