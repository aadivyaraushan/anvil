import { getInterviews } from "@/lib/actions/interviews";
import { getPersonas, getProject } from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewInterviewForm } from "@/components/new-interview-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GenerateBriefButton } from "@/components/generate-brief-button";

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
    .order("company", { ascending: true });
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
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {interview.interviewee_name && (
                    <p className="text-sm font-semibold text-foreground">
                      {interview.interviewee_name}
                      {interview.interviewee_email && (
                        <span className="ml-2 font-normal text-muted-foreground text-xs">
                          {interview.interviewee_email}
                        </span>
                      )}
                    </p>
                  )}
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
                  {interview.persona_id && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {personasById.get(interview.persona_id) ?? "Archetype"}
                    </p>
                  )}

                  {/* Brief preview */}
                  {interview.brief_status === "complete" && interview.brief && (
                    <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">
                        Brief ready
                      </p>
                      <p className="text-xs text-foreground">
                        {interview.brief.role && `${interview.brief.role}`}
                        {interview.brief.company && ` @ ${interview.brief.company}`}
                        {interview.brief.industry && ` · ${interview.brief.industry}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                        {interview.brief.summary}
                      </p>
                    </div>
                  )}
                  {interview.brief_status === "generating" && (
                    <p className="mt-1 text-[11px] text-muted-foreground animate-pulse">
                      Researching interviewee...
                    </p>
                  )}
                  {interview.brief_status === "failed" && (
                    <p className="mt-1 text-[11px] text-destructive">
                      Brief generation failed.
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
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
                  <div className="flex gap-2">
                    {interview.brief_status === "idle" &&
                      interview.status !== "completed" &&
                      (interview.interviewee_name || interview.interviewee_email) && (
                        <GenerateBriefButton
                          projectId={id}
                          interviewId={interview.id}
                        />
                      )}
                    <Link href={`/project/${id}/interviews/${interview.id}`}>
                      <Button variant="outline" size="sm">
                        {interview.status === "completed" ? "View" : "Open"}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
