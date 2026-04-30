"use client";

import { use, useState } from "react";
import { usePersonas, useUpsertPersonas } from "@/lib/hooks/use-projects";
import { ErrorCard } from "@/components/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Persona } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditablePersona = {
  id: string | null; // null for new unsaved personas
  name: string;
  description: string;
  job_titles: string; // comma-separated string for editing
  pain_points: string; // comma-separated string for editing
  status: "suggested" | "confirmed";
};

function toEditable(p: Persona): EditablePersona {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    job_titles: p.job_titles.join(", "),
    pain_points: p.pain_points.join(", "),
    status: p.status,
  };
}

function fromEditable(ep: EditablePersona) {
  return {
    name: ep.name,
    description: ep.description,
    job_titles: ep.job_titles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    pain_points: ep.pain_points
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    status: ep.status,
  };
}

// ---------------------------------------------------------------------------
// PersonaCard
// ---------------------------------------------------------------------------

type PersonaCardProps = {
  persona: EditablePersona;
  onChange: (updated: EditablePersona) => void;
  onConfirm: () => void;
  onRemove: () => void;
};

function PersonaCard({ persona, onChange, onConfirm, onRemove }: PersonaCardProps) {
  const [editing, setEditing] = useState<null | keyof EditablePersona>(null);

  function field(
    key: keyof EditablePersona,
    display: string,
    multiline = false
  ) {
    const value = persona[key] as string;
    const isEditing = editing === key;

    return (
      <div
        className="group"
        onClick={() => setEditing(key)}
        onBlur={() => setEditing(null)}
      >
        <div className="anvil-caps mb-1">{display}</div>
        {isEditing ? (
          multiline ? (
            <textarea
              autoFocus
              value={value}
              rows={3}
              onChange={(e) => onChange({ ...persona, [key]: e.target.value })}
              onBlur={() => setEditing(null)}
              className="w-full text-sm bg-transparent border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          ) : (
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange({ ...persona, [key]: e.target.value })}
              onBlur={() => setEditing(null)}
              className="w-full text-sm bg-transparent border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )
        ) : (
          <p className="text-sm text-foreground cursor-text min-h-[22px] group-hover:text-foreground/80">
            {value || <span className="text-muted-foreground italic">Click to edit</span>}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {editing === "name" ? (
            <input
              autoFocus
              value={persona.name}
              onChange={(e) => onChange({ ...persona, name: e.target.value })}
              onBlur={() => setEditing(null)}
              className="text-lg font-semibold tracking-tight bg-transparent border-b border-border focus:outline-none focus:border-ring w-full"
            />
          ) : (
            <h3
              className="text-lg font-semibold tracking-tight cursor-text hover:opacity-80"
              onClick={() => setEditing("name")}
            >
              {persona.name || <span className="text-muted-foreground italic font-normal">Unnamed archetype</span>}
            </h3>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {persona.status === "suggested" && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
              Suggested
            </Badge>
          )}
          {persona.status === "suggested" && (
            <Button size="sm" variant="outline" onClick={onConfirm} className="text-xs">
              Confirm
            </Button>
          )}
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors ml-1"
            aria-label="Remove archetype"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {field("description", "Description", true)}
      {field("job_titles", "Job titles (comma-separated)")}
      {field("pain_points", "Pain points (comma-separated)", true)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArchetypesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const { data: rawPersonas, isLoading, error, refetch } = usePersonas(projectId);
  const upsertPersonas = useUpsertPersonas();

  const [personas, setPersonas] = useState<EditablePersona[] | null>(null);

  // Initialize local state from server data once loaded
  const effectivePersonas: EditablePersona[] =
    personas ?? (rawPersonas ? rawPersonas.map(toEditable) : []);

  function handleChange(index: number, updated: EditablePersona) {
    const next = [...effectivePersonas];
    next[index] = updated;
    setPersonas(next);
  }

  function handleConfirm(index: number) {
    const next = [...effectivePersonas];
    next[index] = { ...next[index], status: "confirmed" };
    setPersonas(next);
  }

  function handleRemove(index: number) {
    const next = effectivePersonas.filter((_, i) => i !== index);
    setPersonas(next);
  }

  function handleAdd() {
    setPersonas([
      ...effectivePersonas,
      {
        id: null,
        name: "",
        description: "",
        job_titles: "",
        pain_points: "",
        status: "confirmed",
      },
    ]);
  }

  async function handleSave() {
    await upsertPersonas.mutateAsync({
      projectId,
      personas: effectivePersonas.map(fromEditable),
    });
    setPersonas(null); // reset to server state
  }

  const isDirty = personas !== null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            All projects
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <Link
            href={`/project/${projectId}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to project
          </Link>
        </div>
        {isDirty && (
          <Button
            onClick={handleSave}
            disabled={upsertPersonas.isPending}
            size="sm"
          >
            {upsertPersonas.isPending ? "Saving..." : "Save archetypes"}
          </Button>
        )}
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Archetypes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define and refine the customer segments you&apos;re researching.
        </p>
      </div>

      {error && (
        <ErrorCard error={error as Error} onRetry={() => refetch()} className="mb-6" />
      )}

      {upsertPersonas.error && (
        <ErrorCard error={upsertPersonas.error as Error} className="mb-6" />
      )}

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-48" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {effectivePersonas.map((persona, i) => (
            <PersonaCard
              key={persona.id ?? `new-${i}`}
              persona={persona}
              onChange={(updated) => handleChange(i, updated)}
              onConfirm={() => handleConfirm(i)}
              onRemove={() => handleRemove(i)}
            />
          ))}

          <button
            onClick={handleAdd}
            className="w-full py-4 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
          >
            + Add archetype
          </button>
        </div>
      )}
    </div>
  );
}
