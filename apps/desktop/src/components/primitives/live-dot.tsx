"use client"

import { cn } from '@/lib/utils'

type LiveDotProps = {
  size?: 'sm' | 'md'
  color?: 'rose' | 'azure' | 'amber'
  className?: string
}

const colorMap: Record<NonNullable<LiveDotProps['color']>, string> = {
  rose: 'bg-[var(--color-rose)]',
  azure: 'bg-[var(--color-azure)]',
  amber: 'bg-[var(--color-amber)]',
}

export function LiveDot({ size = 'md', color = 'rose', className }: LiveDotProps) {
  // md = 8px core, sm = 5px core
  const dotSize = size === 'md' ? 'w-2 h-2' : 'w-[5px] h-[5px]'

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <span
        className={cn(
          'absolute inline-flex rounded-full opacity-75 animate-ping',
          dotSize,
          colorMap[color]
        )}
      />
      <span
        className={cn(
          'relative inline-flex rounded-full',
          dotSize,
          colorMap[color]
        )}
      />
    </span>
  )
}
