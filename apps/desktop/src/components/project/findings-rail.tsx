'use client'

import { useState } from 'react'
import { useAnalystDocument, usePersonas } from '@/lib/hooks/use-projects'
import { useInterviews } from '@/lib/hooks/use-interviews'
import { useNetworkStatus } from '@/lib/network'
import type { Persona, AnalystDocument } from '@/lib/supabase/types'
import { ThinkingDots } from './thinking-dots'
import { Pill } from './pill'
import { ErrorCard } from '@/components/error-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type FindingsRailProps = {
  projectId: string
}

function isRecentlyUpdated(updatedAt: string): boolean {
  try {
    const updated = new Date(updatedAt).getTime()
    const now = Date.now()
    return now - updated < 5 * 60 * 1000
  } catch {
    return false
  }
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={cn('h-3 bg-muted rounded animate-pulse', className)} />
  )
}

export function FindingsRail({ projectId }: FindingsRailProps) {
  const {
    data: analystDoc,
    isLoading: docLoading,
    isError: docError,
    error: docErr,
    refetch: docRefetch,
  } = useAnalystDocument(projectId)

  const {
    data: personas,
    isLoading: personasLoading,
    isError: personasError,
    error: personasErr,
    refetch: personasRefetch,
  } = usePersonas(projectId)

  const { data: interviewsData } = useInterviews(projectId)

  const isLoading = docLoading || personasLoading
  const interviewCount = interviewsData?.interviews?.length ?? 0

  if (docError) {
    return (
      <aside className="px-5 py-[18px] overflow-auto h-full">
        <ErrorCard
          error={docErr as Error}
          onRetry={() => docRefetch()}
        />
      </aside>
    )
  }

  if (personasError) {
    return (
      <aside className="px-5 py-[18px] overflow-auto h-full">
        <ErrorCard
          error={personasErr as Error}
          onRetry={() => personasRefetch()}
        />
      </aside>
    )
  }

  // Empty state: no analyst doc and fewer than 2 interviews
  if (!isLoading && !analystDoc && interviewCount < 2) {
    return (
      <aside className="px-5 py-[18px] overflow-auto h-full flex items-center justify-center">
        <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
          Complete 2 interviews to unlock findings.
        </p>
      </aside>
    )
  }

  const painPoints: AnalystDocument['pain_points'] = analystDoc?.pain_points ?? []
  const customerLanguage: string[] = analystDoc?.customer_language ?? []
  const confirmedPersonas: Persona[] = (personas ?? []).filter((p: Persona) => p.status === 'confirmed')
  const suggestedPersonas: Persona[] = (personas ?? []).filter((p: Persona) => p.status === 'suggested')

  // We use project's analyst_status for generating indicator — derive from doc presence
  const showGenerating = !analystDoc && interviewCount >= 2
  const { status: networkStatus } = useNetworkStatus()
  const isOffline = networkStatus !== 'online'
  const [running, setRunning] = useState(false)

  async function handleRunAnalysis() {
    if (isOffline || running) return
    setRunning(true)
    try {
      const { getSupabase } = await import('@/lib/supabase/client')
      const session = await getSupabase().auth.getSession()
      const token = session.data.session?.access_token
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.anvil.app'
      await fetch(`${apiUrl}/api/projects/${projectId}/analyst`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <aside className="px-5 py-[18px] overflow-auto h-full">
      {/* Findings section */}
      <div className="flex items-center justify-between mb-3.5">
        <span className="anvil-caps">Findings</span>
        {showGenerating && <ThinkingDots label="Live" />}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-2/3" />
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {painPoints.map((point: AnalystDocument['pain_points'][number], i: number) => (
            <div
              key={i}
              className="relative py-2.5 border-b border-border"
            >
              {analystDoc && isRecentlyUpdated(analystDoc.updated_at) && (
                <span className="absolute -right-1 top-3 w-1 h-1 rounded-full bg-[var(--color-azure)]" />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] font-medium leading-[1.3] flex-1">
                  {point.title}
                </div>
                <div className="anvil-mono text-[11px] text-muted-foreground shrink-0 pt-0.5">
                  ×{point.count}
                </div>
              </div>
              <div className="mt-2">
                <Pill
                  tone={
                    point.severity === 'high'
                      ? 'indigo'
                      : point.severity === 'medium'
                      ? 'amber'
                      : 'outline'
                  }
                >
                  {point.severity}
                </Pill>
              </div>
            </div>
          ))}
          {painPoints.length === 0 && !isLoading && analystDoc && (
            <p className="text-[12px] text-muted-foreground">
              No findings yet.
            </p>
          )}
        </div>
      )}

      {/* Archetypes section */}
      <div className="mt-5">
        <div className="anvil-caps mb-2.5">Archetypes</div>

        {isLoading ? (
          <div className="space-y-2">
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-2/3" />
          </div>
        ) : (
          <>
            {confirmedPersonas.map((persona: Persona) => (
              <div key={persona.id} className="text-[13px] text-foreground mb-1">
                {persona.name}
              </div>
            ))}

            {suggestedPersonas.map((persona: Persona) => (
              <div
                key={persona.id}
                className="text-[13px] text-muted-foreground mb-1 flex items-center gap-1.5"
              >
                <span>{persona.name}</span>
                <Link
                  href={`/project/${projectId}/archetypes`}
                  className="text-[11px] text-[var(--color-azure)] hover:underline"
                >
                  Edit →
                </Link>
              </div>
            ))}

            {suggestedPersonas.length > 0 && confirmedPersonas.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Refined after interview 2.
              </p>
            )}

            {confirmedPersonas.length === 0 && suggestedPersonas.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                No archetypes yet.
              </p>
            )}
          </>
        )}
      </div>

      {/* Customer language section */}
      {customerLanguage.length > 0 && (
        <div className="mt-5">
          <div className="anvil-caps mb-2.5">Customer language</div>
          {isLoading ? (
            <div className="flex flex-wrap gap-1.5">
              <SkeletonLine className="w-16 h-5 rounded-full" />
              <SkeletonLine className="w-20 h-5 rounded-full" />
              <SkeletonLine className="w-14 h-5 rounded-full" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {customerLanguage.map((phrase: string, i: number) => (
                <span
                  key={i}
                  className="anvil-mono text-[11px] bg-muted text-foreground rounded-md px-2 py-0.5"
                >
                  {phrase}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Run analysis */}
      <div className="mt-6 pt-4 border-t border-border">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-[12px] h-7"
          onClick={handleRunAnalysis}
          disabled={isOffline || running || interviewCount < 2}
          title={
            isOffline
              ? 'Needs connection to generate findings.'
              : interviewCount < 2
              ? 'Complete 2 interviews to run analysis.'
              : 'Run analyst'
          }
        >
          {running ? 'Running…' : 'Run analysis'}
        </Button>
        {isOffline && (
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
            Needs connection to generate findings.
          </p>
        )}
      </div>
    </aside>
  )
}
