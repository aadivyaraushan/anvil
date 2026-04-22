"use client"

import { cn } from '@/lib/utils'

type ThinkingDotsProps = {
  label?: string
  className?: string
}

export function ThinkingDots({ label, className }: ThinkingDotsProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex items-center gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[3px] h-[3px] rounded-full bg-[var(--color-azure)]"
            style={{
              animation: 'pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 200}ms`,
            }}
          />
        ))}
      </span>
      {label && (
        <span className="anvil-caps text-muted-foreground">{label}</span>
      )}
    </span>
  )
}
