'use client'

import { useState } from 'react'
import type { Interview } from '@/lib/supabase/types'
import { LiveDot } from './live-dot'
import { SourceGlyph } from './source-glyph'
import { Pill } from './pill'
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

export function InterviewCanvas({ interview, projectId: _projectId }: InterviewCanvasProps) {
  const [followupIndex, setFollowupIndex] = useState(0)

  if (!interview) {
    return (
      <main className="flex flex-col h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground">
          Select an interview to begin.
        </p>
      </main>
    )
  }

  const isLive = interview.status === 'live'
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
        <div>
          <div className="text-[15px] font-medium tracking-[-0.01em]">
            {interview.attendee_name ?? 'Unknown'}
            {interview.attendee_company ? ` · ${interview.attendee_company}` : ''}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <SourceGlyph source={interview.source} />
            {interview.duration_seconds !== null && (
              <>
                <span className="text-border">·</span>
                <span className="anvil-mono">
                  {formatDuration(interview.duration_seconds)}
                </span>
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
              End interview
            </Button>
          </>
        )}
      </div>

      {/* Transcript body */}
      <div className="flex-1 overflow-auto px-10 py-7">
        <div className="max-w-[600px]">
          {transcript.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              {isLive ? 'Transcript will appear here…' : 'No transcript available.'}
            </p>
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
