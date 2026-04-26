'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Mic, Square, Video, Link as LinkIcon } from 'lucide-react'
import type { Interview } from '@/lib/supabase/types'
import { useTauri } from '@/lib/hooks/use-tauri'
import { LiveDot } from './live-dot'
import { SourceGlyph } from './source-glyph'
import { SuggestedFollowupCard } from './suggested-followup-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type InterviewCanvasProps = {
  interview: Interview | null
  projectId?: string
}

type RecordingState = {
  is_recording: boolean
  duration_secs: number
  project_id: string | null
  attendee_name: string | null
  recording_id: string | null
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

export function InterviewCanvas({ interview, projectId: _projectId }: InterviewCanvasProps) {
  const [followupIndex, setFollowupIndex] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [recState, setRecState] = useState<RecordingState>({
    is_recording: false,
    duration_secs: 0,
    project_id: null,
    attendee_name: null,
    recording_id: null,
  })
  const [uploading, setUploading] = useState(false)
  const [tick, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Remember which interview the recording belongs to even if user navigates away
  const recordingInterviewRef = useRef<Interview | null>(null)
  const { invoke, listen, isTauri, readFileBytes } = useTauri()

  // Sync recording state from Tauri on mount
  useEffect(() => {
    invoke<RecordingState>('get_recording_state').then((s) => {
      if (s) setRecState(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    listen<RecordingState>('recording-started', (s) => setRecState(s)).then(
      (fn) => { unlisten = fn }
    )
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    listen<RecordingState>('recording-stopped', (s) => setRecState(s)).then(
      (fn) => { unlisten = fn }
    )
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drive the inline duration counter
  useEffect(() => {
    if (recState.is_recording) {
      timerRef.current = setInterval(() => setTick((t) => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      queueMicrotask(() => setTick(0))
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [recState.is_recording])

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
  const isRecording = recState.is_recording
  const displayDuration = isRecording ? recState.duration_secs + tick : recState.duration_secs

  const handleDismissFollowup = () => {
    setFollowupIndex((i) => (i + 1) % Math.max(suggestedQuestions.length, 1))
  }

  const handleStartRecording = async () => {
    setRecordingError(null)
    recordingInterviewRef.current = interview
    const id = await invoke<string>('start_recording', {
      projectId: interview.project_id,
      attendeeName: interview.attendee_name ?? null,
    })
    if (!id) {
      recordingInterviewRef.current = null
      setRecordingError('Could not start recording. Is the desktop app running?')
      window.setTimeout(() => setRecordingError(null), 4000)
    }
  }

  const handleStopRecording = async () => {
    if (!recState.recording_id) return
    const capturedInterview = recordingInterviewRef.current ?? interview
    setUploading(true)
    setRecordingError(null)
    try {
      const filePath = await invoke<string>('stop_recording', {
        recordingId: recState.recording_id,
      })
      if (!filePath) {
        setRecordingError('Could not finalize recording.')
        return
      }
      const bytes = await readFileBytes(filePath)
      if (!bytes) {
        setRecordingError('Could not read recording file.')
        return
      }
      const fileName = filePath.split(/[\\/]/).pop() ?? 'recording.wav'
      const buf = bytes.slice().buffer as ArrayBuffer
      const blob = new Blob([buf], { type: 'audio/wav' })

      const { getSupabase } = await import('@/lib/supabase/client')
      const session = await getSupabase().auth.getSession()
      const token = session.data.session?.access_token
      if (!token) {
        setRecordingError('Not signed in. Sign in again to upload.')
        return
      }

      const fd = new FormData()
      fd.append('file', blob, fileName)
      fd.append('project_id', recState.project_id ?? capturedInterview.project_id ?? '')
      fd.append('source', 'desktop')
      if (recState.attendee_name ?? capturedInterview.attendee_name) {
        fd.append('attendee_name', recState.attendee_name ?? capturedInterview.attendee_name ?? '')
      }
      fd.append('interview_id', capturedInterview.id)

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/interviews/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }
      )
      if (!res.ok) {
        setRecordingError(`Upload failed (${res.status}). Saved locally, will retry.`)
      }
    } catch (e) {
      setRecordingError('Upload failed. The recording is saved locally and will retry.')
      console.error(e)
    } finally {
      setUploading(false)
      recordingInterviewRef.current = null
    }
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

        {/* Recording controls — inline, no modal */}
        {isRecording ? (
          <div className="flex items-center gap-3">
            <WaveformBars phase={tick * 0.8} />
            <span className="anvil-mono text-[12px] tabular-nums text-[var(--color-rose)]">
              {formatRecDuration(displayDuration)}
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
            disabled={!isTauri}
            className="text-[12px] h-7 inline-flex items-center gap-1.5"
            title={
              isTauri
                ? 'Capture audio for this conversation'
                : 'Recording requires the Anvil desktop app'
            }
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
              {isLive || isRecording ? (
                <>
                  Listening… the live transcript will stream in here as
                  {inPerson ? ' the conversation' : ' the call'} unfolds.
                </>
              ) : isScheduled ? (
                <div className="space-y-3">
                  <p>
                    {inPerson
                      ? 'When the conversation starts, hit Start recording — the live transcript will stream in as you speak.'
                      : 'Anvil will join the call and stream the live transcript here once it starts. You can also record locally as a backup.'}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleStartRecording}
                    disabled={!isTauri}
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
