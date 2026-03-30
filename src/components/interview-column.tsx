"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Interview } from "@/lib/supabase/types";

type Props = {
  projectId: string;
  initialInterviews: Interview[];
};

export function InterviewColumn({ projectId, initialInterviews }: Props) {
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`interviews-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interviews",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const updated = payload.new as Interview;
          if (payload.eventType === "INSERT") {
            setInterviews((prev) => [updated, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setInterviews((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setInterviews((prev) => prev.filter((i) => i.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const liveCount = interviews.filter((i) => i.status === "live").length;
  const scheduledCount = interviews.filter((i) => i.status === "scheduled").length;
  const completedCount = interviews.filter((i) => i.status === "completed").length;

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {interviews.length > 0 && (
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          {liveCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {liveCount} in progress
            </span>
          )}
          {scheduledCount > 0 && <span>{scheduledCount} upcoming</span>}
          {completedCount > 0 && <span>{completedCount} completed</span>}
        </div>
      )}

      <Link href={`/project/${projectId}/interviews`}>
        <Button size="sm" className="w-full">
          {liveCount > 0 ? "Join Active Interview" : "Schedule Interview"}
        </Button>
      </Link>

      <div className="space-y-2">
        {interviews.slice(0, 5).map((interview) => (
          <Link
            key={interview.id}
            href={`/project/${projectId}/interviews/${interview.id}`}
          >
            <div className="cursor-pointer rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent-foreground/[0.04]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {new Date(interview.scheduled_at).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                  <p className="text-[10px] capitalize text-muted-foreground">
                    {interview.meeting_platform === "zoom"
                      ? "Zoom"
                      : "Google Meet"}
                  </p>
                </div>
                <Badge
                  variant={
                    interview.status === "live"
                      ? "default"
                      : interview.status === "completed"
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[10px] capitalize"
                >
                  {interview.status}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {interviews.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground pt-4">
          No interviews yet. Schedule one to start collecting insights.
        </p>
      )}
    </div>
  );
}
