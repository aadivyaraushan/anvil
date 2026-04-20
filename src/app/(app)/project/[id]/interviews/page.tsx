import { getInterviews } from "@/lib/actions/interviews";
import { getPersonas, getProject } from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewInterviewForm } from "@/components/new-interview-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function InterviewsPage({
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

  const interviews = await getInterviews(id);
  const personas = await getPersonas(id);
  const supabase = await createServerSupabaseClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("project_id", id)
    .order("fit_score", { ascending: false });
  const personasById = new Map(personas.map((persona) => [persona.id, persona.name]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href={`/project/${id}`}>
            <Button variant="ghost" size="sm">&larr;</Button>
          </Link>
          <h1 className="text-lg font-semibold">Interviews — {project.name}</h1>
        </div>
        <NewInterviewForm
          projectId={id}
          contacts={contacts ?? []}
          personas={personas}
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {interviews.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No interviews scheduled yet. Use the button above to schedule one.
          </p>
        )}
        <div className="space-y-3">
          {interviews.map((interview) => (
            <div
              key={interview.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {new Date(interview.scheduled_at).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {interview.meeting_platform === "zoom" ? "Zoom" : "Google Meet"} &middot;{" "}
                  <a
                    href={interview.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {interview.meeting_link.slice(0, 40)}...
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {interview.transcript.length} transcript chunks &middot;{" "}
                  {interview.suggested_questions.length} suggestions
                </p>
                {interview.persona_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {personasById.get(interview.persona_id) ?? "Archetype"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    interview.status === "live"
                      ? "default"
                      : interview.status === "completed"
                      ? "secondary"
                      : "outline"
                  }
                  className="capitalize"
                >
                  {interview.status}
                </Badge>
                <Link href={`/project/${id}/interviews/${interview.id}`}>
                  <Button variant="outline" size="sm">
                    {interview.status === "completed" ? "View" : "Open"}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
