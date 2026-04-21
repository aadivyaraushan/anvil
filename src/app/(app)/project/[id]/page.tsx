import {
  getProject,
  getAnalystDocument,
  getPersonas,
} from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InterviewColumn } from "@/components/interview-column";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type {
  Interview,
  AnalystDocument,
  Persona,
} from "@/lib/supabase/types";
import { AnalystColumn } from "@/components/analyst-column";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  if (!project.archetypes_verified) {
    redirect(`/project/${id}/archetypes`);
  }

  const supabase = await createServerSupabaseClient();
  const personas = (await getPersonas(id)) as Persona[];

  const { data: interviewData } = await supabase
    .from("interviews")
    .select("*")
    .eq("project_id", id)
    .order("scheduled_at", { ascending: false });
  const initialInterviews = (interviewData as Interview[]) ?? [];

  const completedInterviewCount = initialInterviews.filter(
    (i) => i.status === "completed"
  ).length;

  const analystDocument = (await getAnalystDocument(id)) as AnalystDocument | null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              &larr;
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {personas.slice(0, 3).map((persona) => (
            <Badge key={persona.id} variant="outline" className="text-[10px]">
              {persona.name}
            </Badge>
          ))}
          <Link href={`/project/${id}/archetypes`}>
            <Button variant="ghost" size="sm">
              Archetypes
            </Button>
          </Link>
          <Link href={`/project/${id}/settings`}>
            <Button variant="ghost" size="sm">
              Settings
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-[#1a1a1e] overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Interviews</h2>
            <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
              Agent 1
            </Badge>
          </div>
          <InterviewColumn
            projectId={id}
            initialInterviews={initialInterviews}
            personas={personas}
          />
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Analyst</h2>
            <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
              Agent 2
            </Badge>
          </div>
          <AnalystColumn
            projectId={id}
            initialDocument={analystDocument}
            initialAnalystStatus={project.analyst_status}
            completedInterviewCount={completedInterviewCount}
            personas={personas}
          />
        </div>
      </div>

      <div className="border-t bg-popover px-6 py-3">
        <p className="text-xs text-muted-foreground">
          Activity feed will show real-time events from all agents.
        </p>
      </div>
    </div>
  );
}
