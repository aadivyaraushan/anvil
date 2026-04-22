"use client"

import { Sparkles } from 'lucide-react'
import { ThinkingDots } from '@/components/primitives/thinking-dots'
import { Button } from '@/components/ui/button'

type SuggestedFollowupCardProps = {
  question: string
  onUse: () => void
  onDismiss: () => void
  loading?: boolean
}

export function SuggestedFollowupCard({
  question,
  onUse,
  onDismiss,
  loading,
}: SuggestedFollowupCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-[var(--color-azure)] shrink-0" />
        <span className="anvil-caps">Suggested follow-up</span>
        <span className="flex-1" />
        {loading && <ThinkingDots />}
      </div>
      <p className="anvil-serif italic text-sm leading-[1.5] text-foreground mb-3">
        {question}
      </p>
      <div className="flex gap-1.5">
        <Button
          variant="default"
          size="sm"
          className="h-7 text-[11px]"
          onClick={onUse}
        >
          Use it
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={onDismiss}
        >
          Next
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}
