'use client'

import { useState } from 'react'
import { MapPin, Video, Link as LinkIcon } from 'lucide-react'
import type { Interview } from '@/lib/supabase/types'
import { LiveDot } from './live-dot'
import { SourceGlyph } from './source-glyph'
import { SuggestedFollowupCard } from './suggested-followup-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type InterviewCanvasProps = {
  interview: Interview | null
  projectId?: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// `meeting_link` holds a URL for online conversations and a plain location
// string for in-person ones (the column is just `text`).
function isInPerson(interview: Interview): boolean {
  return interview.source === 'inperson'
}

function isUrl(value: string | null): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

export function InterviewCanvas({ interview, projectId: _projectId }: InterviewCanvasProps) {
  const [followupIndex, setFollowupIndex] = useState(0)

  if (!interview) {
    return (
      <main className="flex flex-col h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground">
          Select a conversation to see its live transcript.
        </p>
      </main>
    )
  }

  const isLive = interview.status === 'live'
  const isScheduled = interview.status === 'scheduled'
  const inPerson = isInPerson(interview)
  const meetingLinkValue = interview.meeting_link
  const meetingIsUrl = !inPerson && isUrl(meetingLinkValue)
  const transcript = interview.transcript ?? []
  const suggestedQuestions = interview.suggested_questions ?? []
  const currentQuestion = suggestedQuestions[followupIndex] ?? null

  const handleUseFollowup = () => {
    // In a real app, this would insert the question into the active session
  }

  const handleDismissFollowup = () => {
    setFollowupIndex((i) => (i + 1) % Math.max(suggestedQuestions.length, 1))
  }

  return (
    <main className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-[18px] border-b border-border flex items-center gap-3 shrink-0">
        {isLive && <LiveDot size="sm" color="rose" />}
        <div className="min-w-0">
          <div className="text-[15px] font-medium tracking-[-0.01em] truncate">
            {interview.attendee_name ?? 'Unknown'}
            {interview.attendee_company ? ` · ${interview.attendee_company}` : ''}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {/* Modality chip — explicit "In person" vs "Online" */}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] border',
                inPerson
                  ? 'border-[var(--color-amber)]/30 text-[var(--color-amber)]'
                  : 'border-[var(--color-azure)]/30 text-[var(--color-azure)]'
              )}
            >
              {inPerson ? (
                <MapPin className="w-3 h-3" />
              ) : (
                <Video className="w-3 h-3" />
              )}
              <span className="anvil-caps">
                {inPerson ? 'In person' : 'Online'}
              </span>
            </span>
            <span className="text-border">·</span>
            <SourceGlyph source={interview.source} />
            {interview.duration_seconds !== null && (
              <>
                <span className="text-border">·</span>
                <span className="anvil-mono">
                  {formatDuration(interview.duration_seconds)}
                </span>
              </>
            )}
            {meetingLinkValue && (
              <>
                <span className="text-border">·</span>
                {meetingIsUrl ? (
                  <a
                    href={meetingLinkValue}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors max-w-[220px]"
                  >
                    <LinkIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate font-mono">{meetingLinkValue}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 max-w-[220px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{meetingLinkValue}</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <span className="flex-1" />
        {isLive && (
          <>
            <Button variant="outline" size="sm" className="text-[12px] h-7">
              Companion window
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[12px] h-7 text-muted-foreground"
            >
              End conversation
            </Button>
          </>
        )}
      </div>

      {/* Transcript body */}
      <div className="flex-1 overflow-auto px-10 py-7">
        <div className="max-w-[600px]">
          {/* Live transcript section header — makes the central feature explicit */}
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
            <span className="anvil-caps text-muted-foreground">
              Live transcript
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-rose)]">
                <LiveDot size="sm" color="rose" />
                Recording
              </span>
            )}
            {transcript.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                · {transcript.length} {transcript.length === 1 ? 'turn' : 'turns'}
              </span>
            )}
          </div>

          {transcript.length === 0 && (
            <div className="text-[13px] text-muted-foreground leading-relaxed">
              {isLive ? (
                <>
                  Listening… the live transcript will stream in here as
                  {inPerson ? ' the conversation' : ' the call'} unfolds.
                </>
              ) : isScheduled ? (
                <>
                  {inPerson
                    ? 'Open this page during your in-person conversation — the live transcript will stream in as you speak.'
                    : 'Anvil will join the call and stream the live transcript here once it starts.'}
                </>
              ) : (
                'No transcript available for this conversation.'
              )}
            </div>
          )}

          {transcript.map((message, i) => {
            const isInterviewee =
              message.speaker.toLowerCase() !== 'you' &&
              message.speaker.toLowerCase() !== 'interviewer'

            return (
              <div key={i} className="flex gap-3.5 mb-5">
                {/* Timestamp gutter */}
                <div className="anvil-mono text-[11px] text-muted-foreground w-9 shrink-0 pt-[3px]">
                  {formatTimestamp(message.timestamp)}
                </div>

                {/* Message content */}
                <div className="flex-1">
                  <div
                    className={cn(
                      'text-[11px] font-medium mb-1',
                      isInterviewee
                        ? 'text-[var(--color-azure)]'
                        : 'text-muted-foreground'
                    )}
                  >
                    {message.speaker}
                  </div>
                  <div
                    className={cn(
                      'text-[17px] leading-[1.55]',
                      isInterviewee
                        ? 'anvil-serif text-foreground'
                        : 'text-muted-foreground font-normal'
                    )}
                  >
                    {message.text}
                  </div>
                  {/* Tag from transcript message — not in schema but pattern from design */}
                </div>
              </div>
            )
          })}

          {/* Suggested follow-up card */}
          {isLive && currentQuestion && (
            <div className="mt-2">
              <SuggestedFollowupCard
                question={currentQuestion}
                onUse={handleUseFollowup}
                onDismiss={handleDismissFollowup}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
