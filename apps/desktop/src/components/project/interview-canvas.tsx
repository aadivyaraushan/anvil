'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Mic, Square, Video, Link as LinkIcon } from 'lucide-react'
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

function formatTimestamp(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatRecDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function isInPerson(interview: Interview): boolean {
  return interview.source === 'inperson'
}

function isUrl(value: string | null): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

function WaveformBars({ phase }: { phase: number }) {
  return (
    <div className="flex items-center gap-px h-4">
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-[1px] transition-all duration-150"
          style={{
            height: `${3 + Math.abs(Math.sin(phase + i * 0.8)) * 9}px`,
            background: 'oklch(0.70 0.18 20)',
            opacity: 0.45 + i / 36,
          }}
        />
      ))}
    </div>
  )
}

// Preferred mime types in priority order — Deepgram accepts all of them.
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export function InterviewCanvas({ interview, projectId: _projectId }: InterviewCanvasProps) {
  const [followupIndex, setFollowupIndex] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tick, setTick] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Capture which interview this recording is for in case the user
  // navigates to another conversation before stopping.
  const recordingInterviewRef = useRef<Interview | null>(null)

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setTick((t) => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      queueMicrotask(() => setTick(0))
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isRecording])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

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

  const handleDismissFollowup = () => {
    setFollowupIndex((i) => (i + 1) % Math.max(suggestedQuestions.length, 1))
  }

  const handleStartRecording = async () => {
    setRecordingError(null)
    recordingInterviewRef.current = interview

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setRecordingError('Could not access microphone — check your system permissions.')
      return
    }
    streamRef.current = stream

    const { getSupabase } = await import('@/lib/supabase/client')
    const session = await getSupabase().auth.getSession()
    const token = session.data.session?.access_token
    if (!token) {
      setRecordingError('Not signed in. Please sign in again.')
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    const capturedInterview = interview
    let chunkCount = 0

    const sendChunk = async (data: Blob) => {
      if (data.size === 0) return
      const timeOffsetSecs = chunkCount * 10
      chunkCount++

      const fd = new FormData()
      fd.append('audio', data, `chunk-${chunkCount}.webm`)
      fd.append('interview_id', capturedInterview.id)
      fd.append('time_offset_secs', String(timeOffsetSecs))

      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/interviews/transcribe-chunk`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }
        )
      } catch (e) {
        console.error('[canvas] chunk upload failed:', e)
      }
    }

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => { sendChunk(e.data) }

    recorder.start(10_000) // send a chunk every 10 seconds
    setIsRecording(true)
  }

  const handleStopRecording = async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setUploading(true)

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.requestData() // flush the in-progress chunk
      recorder.stop()
    })

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRecorderRef.current = null
    recordingInterviewRef.current = null
    setIsRecording(false)
    setUploading(false)
  }

  return (
    <main className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-[18px] border-b border-border flex items-center gap-3 shrink-0">
        {(isLive || isRecording) && <LiveDot size="sm" color="rose" />}
        <div className="min-w-0">
          <div className="text-[15px] font-medium tracking-[-0.01em] truncate">
            {interview.attendee_name ?? 'Unknown'}
            {interview.attendee_company ? ` · ${interview.attendee_company}` : ''}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {/* Modality chip */}
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

        {/* Recording controls */}
        {isRecording ? (
          <div className="flex items-center gap-3">
            <WaveformBars phase={tick * 0.8} />
            <span className="anvil-mono text-[12px] tabular-nums text-[var(--color-rose)]">
              {formatRecDuration(tick)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStopRecording}
              disabled={uploading}
              className="text-[12px] h-7 inline-flex items-center gap-1.5"
            >
              <Square className="w-3 h-3 fill-current" />
              {uploading ? 'Saving…' : 'Stop'}
            </Button>
          </div>
        ) : isScheduled ? (
          <Button
            size="sm"
            onClick={handleStartRecording}
            className="text-[12px] h-7 inline-flex items-center gap-1.5"
          >
            <Mic className="w-3 h-3" />
            Start recording
          </Button>
        ) : isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] h-7 text-muted-foreground"
          >
            End conversation
          </Button>
        ) : null}
      </div>

      {recordingError && (
        <div className="px-8 py-2 border-b border-border bg-muted/30 text-[12px] text-muted-foreground">
          {recordingError}
        </div>
      )}

      {/* Transcript body */}
      <div className="flex-1 overflow-auto px-10 py-7">
        <div className="max-w-[600px]">
          {/* Live transcript section header */}
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
            <span className="anvil-caps text-muted-foreground">
              Live transcript
            </span>
            {(isLive || isRecording) && (
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
              {isRecording ? (
                <>
                  Listening… transcript segments will appear here every ~10 seconds
                  as the conversation unfolds.
                </>
              ) : isLive ? (
                <>
                  Listening… the live transcript will stream in here as
                  {inPerson ? ' the conversation' : ' the call'} unfolds.
                </>
              ) : isScheduled ? (
                <div className="space-y-3">
                  <p>
                    {inPerson
                      ? 'When the conversation starts, hit Start recording — the live transcript will stream in as you speak.'
                      : 'Hit Start recording to capture this conversation. The transcript will appear as you speak.'}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleStartRecording}
                    className="text-[12px] h-7 inline-flex items-center gap-1.5"
                  >
                    <Mic className="w-3 h-3" />
                    Start recording
                  </Button>
                </div>
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
                <div className="anvil-mono text-[11px] text-muted-foreground w-9 shrink-0 pt-[3px]">
                  {formatTimestamp(message.timestamp)}
                </div>
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
                </div>
              </div>
            )
          })}

          {(isLive || isRecording) && currentQuestion && (
            <div className="mt-2">
              <SuggestedFollowupCard
                question={currentQuestion}
                onUse={() => {}}
                onDismiss={handleDismissFollowup}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
