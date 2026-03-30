"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, Project } from "@/lib/supabase/types";
import type { RealtimePostgresChangesPayload, RealtimePostgresUpdatePayload } from "@supabase/realtime-js";

type Props = {
  project: Project;
  initialContacts: Contact[];
};

export function DiscoveryColumn({ project: initialProject, initialContacts }: Props) {
  const [project, setProject] = useState(initialProject);
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  // Subscribe to realtime updates
  useEffect(() => {
    const supabase = createClient();

    // Listen for contact inserts/updates
    const contactChannel = supabase
      .channel(`contacts-${project.id}`)
      .on<Contact>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `project_id=eq.${project.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Contact>) => {
          const updated = payload.new as Contact;
          setContacts((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id);
            if (idx === -1) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      )
      .subscribe();

    // Listen for project status/progress changes
    const projectChannel = supabase
      .channel(`project-discovery-${project.id}`)
      .on<Project>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${project.id}`,
        },
        (payload: RealtimePostgresUpdatePayload<Project>) => {
          const updated = payload.new as Project;
          setProject((prev) => ({
            ...prev,
            discovery_status: updated.discovery_status,
            discovery_progress: updated.discovery_progress,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [project.id]);

  async function triggerDiscovery() {
    setTriggering(true);
    try {
      await fetch(`/api/projects/${project.id}/discover`, { method: "POST" });
    } finally {
      setTriggering(false);
    }
  }

  const isRunning = project.discovery_status === "running";
  const isPartial = project.discovery_status === "partial";
  const isComplete = project.discovery_status === "complete";
  const total = contacts.length > 0 ? contacts.length : 50;

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* Status / trigger */}
      {(project.discovery_status === "idle" || isComplete) && (
        <Button
          size="sm"
          className="w-full"
          onClick={triggerDiscovery}
          disabled={triggering}
        >
          {triggering
            ? "Starting..."
            : isComplete
            ? "Re-run Discovery"
            : "Run Discovery"}
        </Button>
      )}

      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Processing {project.discovery_progress} of {total} contacts...
        </div>
      )}

      {isPartial && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {project.discovery_progress} of {total} processed
          </p>
          <Button
            size="sm"
            className="w-full"
            onClick={triggerDiscovery}
            disabled={triggering}
          >
            {triggering ? "Resuming..." : "Continue Discovery"}
          </Button>
        </div>
      )}

      {/* Contact list */}
      <div className="space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-accent-foreground/[0.04] transition-colors"
            onClick={() =>
              setExpandedId(expandedId === contact.id ? null : contact.id)
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-foreground">
                  {contact.first_name} {contact.last_name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {contact.title} · {contact.company}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {contact.fit_score !== null && (
                  <Badge
                    variant={contact.fit_status === "passed" ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {contact.fit_score}
                  </Badge>
                )}
                {contact.outreach_status !== "pending" && (
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {contact.outreach_status === "sent"
                      ? "Sent"
                      : contact.outreach_status === "drafted"
                      ? "Queued"
                      : contact.outreach_status}
                  </span>
                )}
              </div>
            </div>

            {/* Expanded email draft */}
            {expandedId === contact.id && contact.email_draft && (
              <div className="mt-3 rounded-md bg-background p-2">
                <p className="text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {contact.email_draft}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {contacts.length === 0 && project.discovery_status === "idle" && (
        <p className="text-[11px] text-muted-foreground text-center pt-4">
          Click &quot;Run Discovery&quot; to source and research contacts.
        </p>
      )}
    </div>
  );
}
