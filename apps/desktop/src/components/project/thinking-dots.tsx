type ThinkingDotsProps = {
  label?: string
}

export function ThinkingDots({ label }: ThinkingDotsProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        <span
          className="w-1 h-1 rounded-full bg-muted-foreground animate-pulse"
          style={{ animationDelay: '0ms', animationDuration: '1.2s' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-muted-foreground animate-pulse"
          style={{ animationDelay: '200ms', animationDuration: '1.2s' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-muted-foreground animate-pulse"
          style={{ animationDelay: '400ms', animationDuration: '1.2s' }}
        />
      </span>
      {label && (
        <span className="anvil-caps text-muted-foreground">{label}</span>
      )}
    </span>
  )
}
