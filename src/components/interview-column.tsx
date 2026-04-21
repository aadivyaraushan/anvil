"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Interview, Persona } from "@/lib/supabase/types";

type CalendarEvent = {
  calendar_event_id: string;
  title: string;
  scheduled_at: string;
  meeting_link: string;
  meeting_platform: "zoom" | "google_meet";
  interviewee_name: string;
  interviewee_email: string;
  confidence: "high" | "low" | "unknown";
};

type EditableEvent = CalendarEvent & {
  persona_id: string;
  importing: boolean;
  skipped: boolean;
};

type Props = {
  projectId: string;
  initialInterviews: Interview[];
  personas: Persona[];
};

export function InterviewColumn({
  projectId,
  initialInterviews,
  personas,
}: Props) {
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const [calendarEvents, setCalendarEvents] = useState<EditableEvent[]>([]);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const personasById = new Map(personas.map((p) => [p.id, p.name]));

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

  async function handleSyncCalendar() {
    setScanState("scanning");
    setCalendarEvents([]);

    const res = await fetch(`/api/projects/${projectId}/calendar/scan`, {
      method: "POST",
    });

    if (res.status === 403) {
      // Not connected — redirect to Google OAuth
      window.location.href = `/api/calendar/connect?project_id=${projectId}`;
      return;
    }

    if (!res.ok) {
      setScanState("idle");
      return;
    }

    const data = (await res.json()) as { events: CalendarEvent[] };
    setCalendarEvents(
      (data.events ?? []).map((e) => ({
        ...e,
        persona_id: "",
        importing: false,
        skipped: false,
      }))
    );
    setScanState("done");
  }

  async function handleImportEvent(calEventId: string) {
    const event = calendarEvents.find((e) => e.calendar_event_id === calEventId);
    if (!event) return;

    setCalendarEvents((prev) =>
      prev.map((e) =>
        e.calendar_event_id === calEventId ? { ...e, importing: true } : e
      )
    );

    await fetch(`/api/projects/${projectId}/interviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: null,
        persona_id: event.persona_id || null,
        meeting_platform: event.meeting_platform,
        meeting_link: event.meeting_link,
        scheduled_at: event.scheduled_at,
        calendar_event_id: event.calendar_event_id,
        interviewee_name: event.interviewee_name,
        interviewee_email: event.interviewee_email,
      }),
    });

    // Remove from calendar list (it will appear in interviews via realtime)
    setCalendarEvents((prev) =>
      prev.filter((e) => e.calendar_event_id !== calEventId)
    );

    // Trigger brief generation on the newly created interview — handled by the
    // interviews POST route after insert so no extra call needed here.
  }

  const liveCount = interviews.filter((i) => i.status === "live").length;
  const scheduledCount = interviews.filter((i) => i.status === "scheduled").length;
  const completedCount = interviews.filter((i) => i.status === "completed").length;

  const visibleEvents = calendarEvents.filter((e) => !e.skipped);

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

      <div className="flex gap-2">
        <Link href={`/project/${projectId}/interviews`} className="flex-1">
          <Button size="sm" className="w-full">
            {liveCount > 0 ? "Join Active Interview" : "Schedule Interview"}
          </Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncCalendar}
          disabled={scanState === "scanning"}
          title="Sync from Google Calendar"
        >
          {scanState === "scanning" ? "Scanning..." : "Sync Calendar"}
        </Button>
      </div>

      {/* Calendar events pending confirmation */}
      {visibleEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Detected interviews — confirm to import
          </p>
          {visibleEvents.map((event) => (
            <div
              key={event.calendar_event_id}
              className="rounded-lg border border-dashed border-border bg-card/60 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {event.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(event.scheduled_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[9px] capitalize"
                >
                  {event.confidence === "high"
                    ? "confident"
                    : event.confidence === "low"
                    ? "uncertain"
                    : "unknown"}
                </Badge>
              </div>

              <div className="grid gap-1">
                <input
                  type="text"
                  placeholder="Interviewee name"
                  value={event.interviewee_name}
                  onChange={(e) =>
                    setCalendarEvents((prev) =>
                      prev.map((ev) =>
                        ev.calendar_event_id === event.calendar_event_id
                          ? { ...ev, interviewee_name: e.target.value }
                          : ev
                      )
                    )
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                />
                <input
                  type="email"
                  placeholder="Interviewee email (for brief research)"
                  value={event.interviewee_email}
                  onChange={(e) =>
                    setCalendarEvents((prev) =>
                      prev.map((ev) =>
                        ev.calendar_event_id === event.calendar_event_id
                          ? { ...ev, interviewee_email: e.target.value }
                          : ev
                      )
                    )
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                />
                {personas.length > 0 && (
                  <select
                    value={event.persona_id}
                    onChange={(e) =>
                      setCalendarEvents((prev) =>
                        prev.map((ev) =>
                          ev.calendar_event_id === event.calendar_event_id
                            ? { ...ev, persona_id: e.target.value }
                            : ev
                        )
                      )
                    }
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    <option value="">Unassigned archetype</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-6 text-[10px]"
                  disabled={event.importing}
                  onClick={() => handleImportEvent(event.calendar_event_id)}
                >
                  {event.importing ? "Importing..." : "Import + Generate Brief"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    setCalendarEvents((prev) =>
                      prev.map((ev) =>
                        ev.calendar_event_id === event.calendar_event_id
                          ? { ...ev, skipped: true }
                          : ev
                      )
                    )
                  }
                >
                  Skip
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {scanState === "done" && visibleEvents.length === 0 && calendarEvents.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          No new interview-like events found in the next 30 days.
        </p>
      )}

      {/* Existing interviews */}
      <div className="space-y-2">
        {interviews.slice(0, 5).map((interview) => (
          <Link
            key={interview.id}
            href={`/project/${projectId}/interviews/${interview.id}`}
          >
            <div className="cursor-pointer rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent-foreground/[0.04]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {interview.interviewee_name && (
                    <p className="text-xs font-semibold text-foreground">
                      {interview.interviewee_name}
                    </p>
                  )}
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
                    {interview.persona_id &&
                      ` · ${personasById.get(interview.persona_id) ?? "Archetype"}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
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
                  {interview.brief_status === "complete" && (
                    <Badge
                      variant="outline"
                      className="text-[9px] border-emerald-500/40 text-emerald-400"
                    >
                      Brief ready
                    </Badge>
                  )}
                  {interview.brief_status === "generating" && (
                    <Badge variant="outline" className="text-[9px] animate-pulse">
                      Researching...
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {interviews.length === 0 && scanState !== "done" && (
        <p className="text-center text-[11px] text-muted-foreground pt-4">
          No interviews yet. Schedule one or sync your Google Calendar.
        </p>
      )}
    </div>
  );
}
