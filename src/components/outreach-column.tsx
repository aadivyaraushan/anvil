"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, Persona, Project } from "@/lib/supabase/types";
import type { RealtimePostgresChangesPayload, RealtimePostgresUpdatePayload } from "@supabase/realtime-js";

type Props = {
  project: Project;
  initialContacts: Contact[];
  personas: Persona[];
};

export function OutreachColumn({
  project: initialProject,
  initialContacts,
  personas,
}: Props) {
  const [project, setProject] = useState(initialProject);
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const personasById = new Map(personas.map((persona) => [persona.id, persona.name]));

  useEffect(() => {
    const supabase = createClient();

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

    const projectChannel = supabase
      .channel(`project-outreach-${project.id}`)
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
            outreach_status: updated.outreach_status,
            outreach_progress: updated.outreach_progress,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [project.id]);

  async function triggerOutreach() {
    setTriggering(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/outreach`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setImportMessage(payload.error ?? "Could not run outreach.");
      } else {
        setImportMessage(null);
      }
    } finally {
      setTriggering(false);
    }
  }

  async function importFile(file: File) {
    setIsImporting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/contacts/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content: await file.text(),
        }),
      });

      const payload = (await response.json()) as {
        imported?: number;
        skipped?: number;
        error?: string;
      };

      if (!response.ok) {
        setImportMessage(payload.error ?? "Could not import that file.");
        return;
      }

      setImportMessage(
        `Imported ${payload.imported ?? 0} profile${
          payload.imported === 1 ? "" : "s"
        }${payload.skipped ? `, skipped ${payload.skipped} duplicates` : ""}.`
      );
    } finally {
      setIsImporting(false);
    }
  }

  const isRunning = project.outreach_status === "running";
  const isPartial = project.outreach_status === "partial";
  const isComplete = project.outreach_status === "complete";
  const total = contacts.length;

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-3">
        <p className="text-xs font-medium text-foreground">
          Import founder-owned exports
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Upload LinkedIn or Instagram exports in CSV or JSON. Anvil will score
          profiles against {personas.length} archetype{personas.length === 1 ? "" : "s"}.
        </p>
        <label className="mt-3 block">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void importFile(file);
              event.target.value = "";
            }}
          />
          <span className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
            {isImporting ? "Importing..." : "Upload CSV or JSON"}
          </span>
        </label>
        {importMessage && (
          <p className="mt-2 text-[11px] text-muted-foreground">{importMessage}</p>
        )}
      </div>

      {(project.outreach_status === "idle" || isComplete) && (
        <Button
          size="sm"
          className="w-full"
          onClick={triggerOutreach}
          disabled={triggering}
        >
          {triggering
            ? "Starting..."
            : isComplete
            ? "Score New Profiles"
            : "Score Imported Profiles"}
        </Button>
      )}

      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Processing {project.outreach_progress} of {total} contacts...
        </div>
      )}

      {isPartial && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {project.outreach_progress} of {total} processed
          </p>
          <Button
            size="sm"
            className="w-full"
            onClick={triggerOutreach}
            disabled={triggering}
          >
            {triggering ? "Resuming..." : "Continue Outreach"}
          </Button>
        </div>
      )}

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
                {contact.persona_id && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Best-fit archetype: {personasById.get(contact.persona_id) ?? "Unknown"}
                  </p>
                )}
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

            {expandedId === contact.id && contact.email_draft && (
              <>
                {typeof contact.research_brief?.fit_rationale === "string" && (
                  <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                    {contact.research_brief.fit_rationale}
                  </p>
                )}
                <div className="mt-2 rounded-md bg-background p-2">
                  <p className="text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {contact.email_draft}
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {contacts.length === 0 && project.outreach_status === "idle" && (
        <p className="text-[11px] text-muted-foreground text-center pt-4">
          Import a CSV or JSON export to start scoring prospects.
        </p>
      )}
    </div>
  );
}
