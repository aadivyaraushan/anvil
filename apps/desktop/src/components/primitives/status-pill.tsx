"use client"

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type StatusPillProps = {
  tone: 'indigo' | 'amber' | 'rose' | 'azure' | 'outline' | 'muted'
  children: ReactNode
  className?: string
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  indigo: 'bg-primary/15 text-primary',
  amber: 'bg-[var(--color-amber)]/15 text-[var(--color-amber)]',
  rose: 'bg-[var(--color-rose)]/15 text-[var(--color-rose)]',
  azure: 'bg-[var(--color-azure)]/15 text-[var(--color-azure)]',
  outline: 'border border-border text-muted-foreground',
  muted: 'bg-muted text-muted-foreground',
}

export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
