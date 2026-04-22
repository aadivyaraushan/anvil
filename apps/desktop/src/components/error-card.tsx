'use client'

import { Card, CardContent } from '@/components/ui/card'
import { AnvilError, mapError } from '@/lib/errors'
import { cn } from '@/lib/utils'

type ErrorCardProps = {
  error: AnvilError | Error | null
  onRetry?: () => void
  className?: string
}

export function ErrorCard({ error, onRetry, className }: ErrorCardProps) {
  if (!error) return null

  const mapped = mapError(error)

  return (
    <Card className={cn('border-destructive/40', className)}>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <p className="text-sm text-destructive">{mapped.userMessage}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 rounded px-2 py-1 text-xs font-medium ring-1 ring-destructive/40 hover:bg-destructive/10 transition-colors"
          >
            Retry
          </button>
        )}
      </CardContent>
    </Card>
  )
}
