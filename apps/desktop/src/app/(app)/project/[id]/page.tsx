'use client'

import { useState, use } from 'react'
import { useInterviews } from '@/lib/hooks/use-interviews'
import { InterviewInbox } from '@/components/project/interview-inbox'
import { InterviewCanvas } from '@/components/project/interview-canvas'
import { FindingsRail } from '@/components/project/findings-rail'
import type { Interview } from '@/lib/supabase/types'

type ProjectPageProps = {
  params: Promise<{ id: string }>
}

function ProjectWorkspace({ id }: { id: string }) {
  const [activeInterviewId, setActiveInterviewId] = useState<string | undefined>()
  const { data } = useInterviews(id)

  const activeInterview: Interview | null =
    data?.interviews.find((i) => i.id === activeInterviewId) ?? null

  return (
    <div className="grid grid-cols-[280px_1fr_340px] h-screen divide-x divide-border">
      <InterviewInbox
        projectId={id}
        activeInterviewId={activeInterviewId}
        onSelect={setActiveInterviewId}
      />
      <InterviewCanvas interview={activeInterview} projectId={id} />
      <FindingsRail projectId={id} />
    </div>
  )
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  return <ProjectWorkspace id={id} />
}
