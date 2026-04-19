"use client";

import { useState, useEffect, useTransition } from "react";
import { saveArchetypes } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/lib/supabase/types";
import { X, Plus } from "lucide-react";

type ArchetypeData = {
  tempId: string;
  name: string;
  description: string;
  job_titles: string[];
  pain_points: string[];
};

type CardField = keyof Omit<ArchetypeData, "tempId">;

let _nextId = 0;
function makeTempId() {
  return `t${_nextId++}`;
}

export function ArchetypeSetup({ project }: { project: Project }) {
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [retryCount, setRetryCount] = useState(0);
  const [archetypes, setArchetypes] = useState<ArchetypeData[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLoadStatus("loading");
    fetch(`/api/projects/${project.id}/generate-archetypes`)
      .then((r) => r.json())
      .then(({ archetypes: raw }) => {
        setArchetypes(
          (
            raw as Array<Omit<ArchetypeData, "tempId">>
          ).map((a) => ({ ...a, tempId: makeTempId() }))
        );
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [project.id, retryCount]);

  function update(tempId: string, field: CardField, value: unknown) {
    setArchetypes((prev) =>
      prev.map((a) => (a.tempId === tempId ? { ...a, [field]: value } : a))
    );
  }

  function remove(tempId: string) {
    setArchetypes((prev) => prev.filter((a) => a.tempId !== tempId));
  }

  function addBlank() {
    setArchetypes((prev) => [
      ...prev,
      {
        tempId: makeTempId(),
        name: "",
        description: "",
        job_titles: [],
        pain_points: [],
      },
    ]);
  }

  function confirm() {
    startTransition(async () => {
      await saveArchetypes(
        project.id,
        archetypes.map(({ tempId: _t, ...rest }) => rest)
      );
    });
  }

  function skip() {
    startTransition(async () => {
      await saveArchetypes(project.id, []);
    });
  }

  if (loadStatus === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm text-muted-foreground">Analyzing your idea…</p>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <p className="text-sm text-destructive">
          Could not generate archetypes.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRetryCount((c) => c + 1)}
        >
          Retry
        </Button>
        <button
          type="button"
          onClick={skip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1
          className="text-2xl font-semibold"
          style={{ letterSpacing: "-0.02em" }}
        >
          Who are your customers?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We identified {archetypes.length} customer archetype
          {archetypes.length !== 1 ? "s" : ""} from your idea. Edit or remove
          any that don&apos;t fit, then confirm to get started.
        </p>
      </div>

      <div className="space-y-4">
        {archetypes.map((a) => (
          <ArchetypeCard
            key={a.tempId}
            archetype={a}
            onChange={(field, value) => update(a.tempId, field, value)}
            onRemove={() => remove(a.tempId)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addBlank}
        className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add archetype
      </button>

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={confirm} disabled={isPending}>
          {isPending ? "Saving…" : "Confirm archetypes"}
        </Button>
        <button
          type="button"
          onClick={skip}
          disabled={isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function ArchetypeCard({
  archetype,
  onChange,
  onRemove,
}: {
  archetype: ArchetypeData;
  onChange: (field: CardField, value: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-5">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Remove archetype"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="grid gap-4 pr-6">
        <Input
          value={archetype.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Archetype name"
          className="border-0 bg-transparent px-0 text-base font-semibold placeholder:text-muted-foreground/50 focus-visible:ring-0 h-auto"
        />

        <Textarea
          value={archetype.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Who they are, their situation, and why this product matters to them."
          rows={3}
          className="resize-none border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0"
        />

        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pain points
          </p>
          {archetype.pain_points.map((pt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">·</span>
              <Input
                value={pt}
                onChange={(e) => {
                  const updated = [...archetype.pain_points];
                  updated[i] = e.target.value;
                  onChange("pain_points", updated);
                }}
                placeholder="Pain point"
                className="h-7 border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => {
                  onChange(
                    "pain_points",
                    archetype.pain_points.filter((_, j) => j !== i)
                  );
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange("pain_points", [...archetype.pain_points, ""])
            }
            className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
          >
            + Add pain point
          </button>
        </div>
      </div>
    </div>
  );
}
