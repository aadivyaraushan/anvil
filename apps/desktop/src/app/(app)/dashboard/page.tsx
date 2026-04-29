"use client";

import { useState } from "react";
import { useDeleteProject, useProjects } from "@/lib/hooks/use-projects";
import { useUser } from "@/lib/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { ErrorCard } from "@/components/error-card";
import { mapError } from "@/lib/errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project, AnalystDocument, UserSettings } from "@/lib/supabase/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateMicro(d: Date): string {
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const date = d.getDate();
  return `${day} · ${month} ${date}`;
}

function isThisWeek(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return d >= sevenDaysAgo && d <= now;
}

function getProjectStatus(p: Project, interviews: { project_id: string; status: string; scheduled_at: string | null; created_at: string }[]) {
  const projectInterviews = interviews.filter((i) => i.project_id === p.id);
  if (projectInterviews.some((i) => i.status === "live")) return "live";
  if (projectInterviews.some((i) => isThisWeek(i.created_at) || (i.scheduled_at && isThisWeek(i.scheduled_at)))) return "active";
  return "idle";
}

function projectNote(
  p: Project,
  interviews: { project_id: string; status: string; scheduled_at: string | null; attendee_name: string | null; created_at: string }[]
) {
  const pi = interviews.filter((i) => i.project_id === p.id);
  const live = pi.find((i) => i.status === "live");
  if (live) {
    const name = live.attendee_name ?? "Someone";
    return `${name} is live now.`;
  }
  const upcoming = pi.filter((i) => i.status === "scheduled" && i.scheduled_at && new Date(i.scheduled_at) > new Date());
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const name = next.attendee_name ?? "Interview";
    const when = next.scheduled_at ? new Date(next.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
    return `${name}${when ? " · " + when : ""}.`;
  }
  if (pi.length > 0) {
    const last = pi.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const lastDate = new Date(last.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Last interview ${lastDate}.`;
  }
  return "No interviews scheduled.";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-center gap-[18px] px-1 py-5 border-t border-border animate-pulse">
      <div className="w-2 h-2 rounded-full bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="h-3 w-56 rounded bg-muted" />
      </div>
      <div className="flex gap-6">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
      <div className="h-4 w-4 rounded bg-muted" />
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
      <div className="h-3 w-28 rounded bg-muted" />
      <div className="h-8 w-12 rounded bg-muted" />
      <div className="h-3 w-24 rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const user = useUser();
  const { data: projects, isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useProjects();

  // All interviews across projects (flat list from all project queries — we do a cross-project query)
  const { data: allInterviews } = useQuery({
    queryKey: ["interviews", "all"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("interviews")
        .select("id, project_id, status, scheduled_at, attendee_name, created_at, source, meeting_link")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Analyst documents for stats
  const { data: analystDocs } = useQuery({
    queryKey: ["analyst_documents", "all"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("analyst_documents")
        .select("unique_pattern_count, key_quotes");
      return (data ?? []) as Pick<AnalystDocument, "unique_pattern_count" | "key_quotes">[];
    },
  });

  // Desktop connected check
  const { data: userSettings } = useQuery<UserSettings | null>({
    queryKey: ["user_settings", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const supabase = getSupabase();
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data as UserSettings | null;
    },
    enabled: Boolean(user),
  });

  const interviews = allInterviews ?? [];
  const capturedThisWeek = interviews.filter((i) => isThisWeek(i.created_at)).length;
  const patternsEmerging = (analystDocs ?? []).reduce((sum, d) => sum + (d.unique_pattern_count ?? 0), 0);
  const quotesToReview = (analystDocs ?? []).reduce((sum, d) => sum + ((d.key_quotes as unknown[])?.length ?? 0), 0);

  // Hero headline
  const liveInterview = interviews.find((i) => i.status === "live");
  const upcomingInterviews = interviews.filter(
    (i) => i.status === "scheduled" && i.scheduled_at && new Date(i.scheduled_at) > new Date()
  );

  let heroMain: string;
  let heroSub: string;
  if (liveInterview) {
    const name = liveInterview.attendee_name ?? "Conversation";
    const time = liveInterview.scheduled_at
      ? new Date(liveInterview.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "now";
    // Don't hardcode "on Meet" — conversations can be in-person too.
    const where =
      liveInterview.source === "inperson"
        ? "in person"
        : liveInterview.meeting_link
        ? "on a call"
        : "";
    heroMain = where ? `${name} at ${time} ${where}.` : `${name} at ${time}.`;
    heroSub = "Live now — transcript updating.";
  } else if (upcomingInterviews.length > 0) {
    heroMain = `You have ${upcomingInterviews.length} upcoming conversation${upcomingInterviews.length !== 1 ? "s" : ""}.`;
    heroSub = "Open a conversation when you're ready to record.";
  } else {
    heroMain = "No conversations scheduled yet.";
    heroSub = "Add a project or conversation to get started.";
  }

  const firstProjectId = projects?.[0]?.id;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="flex items-center px-10 py-[22px] border-b border-border">
        <div className="font-semibold text-[16px] tracking-tight">Anvil</div>
        <span className="flex-1" />
        {userSettings?.desktop_connected_at && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-card border border-border rounded-[7px] text-xs text-muted-foreground mr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose" />
            Desktop app connected
          </div>
        )}
        {firstProjectId ? (
          <Link
            href={`/project/${firstProjectId}`}
            className="ml-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mr-0.5"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Add conversation
          </Link>
        ) : (
          <button
            onClick={() => router.push("/dashboard/new")}
            className="ml-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mr-0.5"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Add conversation
          </button>
        )}
        <Link
          href="/dashboard/new"
          className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mr-0.5"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          New project
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto px-10 py-11">
        <div className="max-w-[1000px] mx-auto">
          {/* Hero */}
          <div className="anvil-caps mb-2">{formatDateMicro(new Date())}</div>
          <h1 className="m-0 text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] max-w-[720px]">
            {heroMain}{" "}
            <span className="text-muted-foreground">{heroSub}</span>
          </h1>

          {/* Stat tiles */}
          <div className="mt-8 grid grid-cols-3 gap-3">
            {projectsLoading ? (
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            ) : (
              <>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="anvil-caps">Captured this week</div>
                  <div className="anvil-mono text-[32px] font-semibold tracking-[-0.02em] mt-1.5">{capturedThisWeek}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">conversations captured</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="anvil-caps">Patterns emerging</div>
                  <div className="anvil-mono text-[32px] font-semibold tracking-[-0.02em] mt-1.5">{patternsEmerging}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">across all projects</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="anvil-caps">Quotes to review</div>
                  <div className="anvil-mono text-[32px] font-semibold tracking-[-0.02em] mt-1.5">{quotesToReview}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">flagged by Anvil</div>
                </div>
              </>
            )}
          </div>

          {/* Projects */}
          <div className="mt-11">
            <div className="anvil-caps mb-3.5">Projects</div>

            {projectsError && (
              <ErrorCard error={projectsError as Error} onRetry={() => refetchProjects()} className="mb-4" />
            )}

            <div className="flex flex-col">
              {projectsLoading && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              )}

              {!projectsLoading && projects?.length === 0 && (
                <div className="border-t border-border py-10 text-center text-sm text-muted-foreground">
                  No projects yet.{" "}
                  <Link href="/dashboard/new" className="underline underline-offset-2">
                    Create your first project
                  </Link>
                </div>
              )}

              {!projectsLoading &&
                projects?.map((p) => {
                  const status = getProjectStatus(p, interviews);
                  const note = projectNote(p, interviews);
                  const projectInterviews = interviews.filter((i) => i.project_id === p.id);
                  const upcomingCount = projectInterviews.filter(
                    (i) => i.status === "scheduled" && i.scheduled_at && new Date(i.scheduled_at) > new Date()
                  ).length;
                  return (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      status={status}
                      note={note}
                      interviewCount={projectInterviews.length}
                      upcomingCount={upcomingCount}
                    />
                  );
                })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project row
// ---------------------------------------------------------------------------

type ProjectRowProps = {
  project: Project;
  status: "live" | "active" | "idle";
  note: string;
  interviewCount: number;
  upcomingCount: number;
};

function ProjectRow({
  project,
  status,
  note,
  interviewCount,
  upcomingCount,
}: ProjectRowProps) {
  const router = useRouter();
  const deleteProject = useDeleteProject();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/project/${project.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/project/${project.id}`);
          }
        }}
        data-testid={`project-row-${project.id}`}
        className="flex items-center gap-[18px] px-1 py-5 border-t border-border hover:bg-muted/30 transition-colors text-left w-full group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background:
              status === "live"
                ? "var(--rose)"
                : status === "active"
                ? "var(--amber)"
                : "var(--muted-foreground)",
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-medium tracking-title truncate">
            {project.name}
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">{note}</div>
        </div>
        <div className="flex gap-6 text-xs text-muted-foreground shrink-0">
          <div>
            <span className="anvil-mono text-[13px] text-foreground">
              {interviewCount}
            </span>{" "}
            interviews
          </div>
          <div>
            <span className="anvil-mono text-[13px] text-foreground">
              {upcomingCount}
            </span>{" "}
            upcoming
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid={`project-row-kebab-${project.id}`}
            aria-label="Project actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="shrink-0 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100 text-muted-foreground hover:text-foreground transition-opacity px-1 cursor-pointer"
          >
            ⋮
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => router.push(`/project/${project.id}/settings`)}
            >
              Project settings
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`project-row-delete-${project.id}`}
              variant="destructive"
              onClick={() => {
                setConfirmText("");
                setConfirmOpen(true);
              }}
            >
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
        >
          <path
            d="M6 3l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          onClick={(e) => e.stopPropagation()}
          data-testid={`project-row-delete-dialog-${project.id}`}
        >
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This permanently removes the project, all of its conversations,
              transcripts, and findings. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Type{" "}
              <span className="font-mono font-medium text-foreground">
                {project.name}
              </span>{" "}
              to confirm.
            </p>
            <Input
              data-testid={`project-row-delete-input-${project.id}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={project.name}
              autoFocus
            />
          </div>
          {deleteProject.error && (
            <ErrorCard error={mapError(deleteProject.error)} />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteProject.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid={`project-row-delete-confirm-${project.id}`}
              disabled={
                confirmText !== project.name || deleteProject.isPending
              }
              onClick={() => {
                deleteProject.mutate(project.id, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    setConfirmText("");
                  },
                });
              }}
            >
              {deleteProject.isPending
                ? "Deleting…"
                : "Permanently delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
