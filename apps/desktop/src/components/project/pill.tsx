import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type PillProps = {
  tone?: 'indigo' | 'amber' | 'rose' | 'azure' | 'outline'
  children: ReactNode
  className?: string
}

const toneClasses: Record<NonNullable<PillProps['tone']>, string> = {
  indigo: 'bg-primary text-primary-foreground border-transparent',
  amber:
    'bg-[var(--color-amber)]/15 text-[var(--color-amber)] border-[var(--color-amber)]/30',
  rose: 'bg-[var(--color-rose)]/15 text-[var(--color-rose)] border-[var(--color-rose)]/30',
  azure:
    'bg-[var(--color-azure)]/15 text-[var(--color-azure)] border-[var(--color-azure)]/30',
  outline: 'bg-transparent text-muted-foreground border-border',
}

export function Pill({ tone = 'outline', children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
