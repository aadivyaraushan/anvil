import { cn } from '@/lib/utils'

type LiveDotProps = {
  size?: 'sm' | 'md'
  color?: 'rose' | 'azure' | 'amber'
}

const colorMap = {
  rose: 'bg-[var(--color-rose)]',
  azure: 'bg-[var(--color-azure)]',
  amber: 'bg-[var(--color-amber)]',
}

const pingColorMap = {
  rose: 'bg-[var(--color-rose)]',
  azure: 'bg-[var(--color-azure)]',
  amber: 'bg-[var(--color-amber)]',
}

export function LiveDot({ size = 'sm', color = 'rose' }: LiveDotProps) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'

  return (
    <span className="relative inline-flex items-center justify-center">
      <span
        className={cn(
          'absolute inline-flex rounded-full opacity-75 animate-ping',
          dotSize,
          pingColorMap[color]
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
