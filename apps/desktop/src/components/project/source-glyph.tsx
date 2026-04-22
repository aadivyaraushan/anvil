import type { InterviewSource } from '@/lib/supabase/types'

type SourceGlyphProps = {
  source: InterviewSource
}

const sourceMeta: Record<InterviewSource, { label: string; colorClass: string }> = {
  desktop: { label: 'Desktop', colorClass: 'bg-[var(--color-rose)]' },
  cal: { label: 'Calendar', colorClass: 'bg-[var(--color-azure)]' },
  inperson: { label: 'In-person', colorClass: 'bg-[var(--color-amber)]' },
  uploaded: { label: 'Uploaded', colorClass: 'bg-muted-foreground' },
  meet_link: { label: 'Meet link', colorClass: 'bg-[var(--color-azure)]' },
}

export function SourceGlyph({ source }: SourceGlyphProps) {
  const meta = sourceMeta[source]
  if (!meta) return null

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block w-[5px] h-[5px] rounded-full shrink-0 ${meta.colorClass}`}
      />
      <span className="anvil-caps">{meta.label}</span>
    </span>
  )
}
