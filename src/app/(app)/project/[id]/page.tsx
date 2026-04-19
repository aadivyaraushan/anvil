import { getProject, getAnalystDocument } from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutreachColumn } from "@/components/outreach-column";
import { InterviewColumn } from "@/components/interview-column";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Contact, Interview, AnalystDocument } from "@/lib/supabase/types";
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

  const supabase = await createServerSupabaseClient();
  const { data: contactData } = await supabase
    .from("contacts")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  const initialContacts = (contactData as Contact[]) ?? [];

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
        <Link href={`/project/${id}/settings`}>
          <Button variant="ghost" size="sm">
            Settings
          </Button>
        </Link>
      </div>

      <div className="grid flex-1 grid-cols-3 divide-x divide-[#1a1a1e] overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Outreach</h2>
            <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
              Agent 1
            </Badge>
          </div>
          <OutreachColumn project={project} initialContacts={initialContacts} />
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Interviews</h2>
            <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
              Agent 2
            </Badge>
          </div>
          <InterviewColumn projectId={id} initialInterviews={initialInterviews} />
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Analyst</h2>
            <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
              Agent 3
            </Badge>
          </div>
          <AnalystColumn
            projectId={id}
            initialDocument={analystDocument}
            initialAnalystStatus={project.analyst_status}
            completedInterviewCount={completedInterviewCount}
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
