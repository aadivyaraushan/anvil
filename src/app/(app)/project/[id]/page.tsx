import { getProject } from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiscoveryColumn } from "@/components/discovery-column";
import { InterviewColumn } from "@/components/interview-column";
import { PrototypeBuildStatus } from "@/components/prototype-build-status";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Contact } from "@/lib/supabase/types";
import type { Interview } from "@/lib/supabase/types";
import { SynthesisColumn } from "@/components/synthesis-column";
import { getSynthesisDocument } from "@/lib/actions/projects";
import type { SynthesisDocument } from "@/lib/supabase/types";

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

  const isSetupPhase = project.prototype_status !== "deployed";

  // Fetch initial contacts for the Discovery column
  let initialContacts: Contact[] = [];
  let initialInterviews: Interview[] = [];
  let completedInterviewCount = 0;
  let synthesisDocument: SynthesisDocument | null = null;
  if (!isSetupPhase) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });
    initialContacts = (data as Contact[]) ?? [];

    const { data: interviewData } = await supabase
      .from("interviews")
      .select("*")
      .eq("project_id", id)
      .order("scheduled_at", { ascending: false });
    initialInterviews = (interviewData as Interview[]) ?? [];

    // Count completed interviews for the synthesis column
    completedInterviewCount = initialInterviews.filter(
      (i) => i.status === "completed"
    ).length;

    // Fetch synthesis document (always exists — auto-created by DB trigger)
    synthesisDocument = await getSynthesisDocument(id) as SynthesisDocument | null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              &larr;
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            {project.prototype_url && (
              <a
                href={project.prototype_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                {project.prototype_url}
              </a>
            )}
          </div>
        </div>
        <Link href={`/project/${id}/settings`}>
          <Button variant="ghost" size="sm">
            Settings
          </Button>
        </Link>
      </div>

      {isSetupPhase ? (
        <PrototypeBuildStatus
          projectId={id}
          initialStatus={project.prototype_status}
          initialPhase={project.prototype_phase}
          projectName={project.name}
          createdAt={project.created_at}
        />
      ) : (
        /* Phase 2: Three-column workspace */
        <div className="grid flex-1 grid-cols-3 divide-x divide-[#1a1a1e] overflow-hidden">
          {/* Discovery Column */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Discovery</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 1
              </Badge>
            </div>
            <DiscoveryColumn project={project} initialContacts={initialContacts} />
          </div>

          {/* Interviews Column */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Interviews</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 2
              </Badge>
            </div>
            <InterviewColumn projectId={id} initialInterviews={initialInterviews} />
          </div>

          {/* Synthesis Column */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Synthesis</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 3
              </Badge>
            </div>
            <SynthesisColumn
              projectId={id}
              initialDocument={synthesisDocument}
              initialSynthesisStatus={project.synthesis_status}
              completedInterviewCount={completedInterviewCount}
            />
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="border-t bg-popover px-6 py-3">
        <p className="text-xs text-muted-foreground">
          Activity feed will show real-time events from all agents.
        </p>
      </div>
    </div>
  );
}
