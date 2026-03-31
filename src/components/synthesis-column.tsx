"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SynthesisDocument, SynthesisStatus } from "@/lib/supabase/types";

type PainPoint = {
  description: string;
  severity: string;
  frequency: number;
  quotes: Array<{ text: string; contact_id: string; interview_id: string }>;
};

type Pattern = {
  name: string;
  description: string;
  interviewIds: string[];
};

type Props = {
  projectId: string;
  initialDocument: SynthesisDocument | null;
  initialSynthesisStatus: SynthesisStatus;
  completedInterviewCount: number;
};

function severityClass(severity: string): string {
  if (severity === "high") return "border-red-500/50 text-red-400";
  if (severity === "medium") return "border-yellow-500/50 text-yellow-400";
  return "border-zinc-500/50 text-zinc-400";
}

export function SynthesisColumn({
  projectId,
  initialDocument,
  initialSynthesisStatus,
  completedInterviewCount,
}: Props) {
  const [document, setDocument] = useState<SynthesisDocument | null>(initialDocument);
  const [status, setStatus] = useState<SynthesisStatus>(initialSynthesisStatus);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const docChannel = supabase
      .channel(`synthesis-doc-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "synthesis_documents",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setDocument(payload.new as SynthesisDocument);
        }
      )
      .subscribe();

    const projChannel = supabase
      .channel(`synthesis-status-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          const updated = payload.new as { synthesis_status: SynthesisStatus };
          setStatus(updated.synthesis_status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(docChannel);
      supabase.removeChannel(projChannel);
    };
  }, [projectId]);

  async function runSynthesis() {
    setTriggering(true);
    try {
      await fetch(`/api/projects/${projectId}/synthesize`, { method: "POST" });
    } finally {
      setTriggering(false);
    }
  }

  const painPoints = (document?.pain_points ?? []) as PainPoint[];
  const patterns = (document?.patterns ?? []) as Pattern[];
  const keyQuotes = document?.key_quotes ?? [];
  const summary = (document?.content as { summary?: string })?.summary;
  const isGenerating = status === "generating";
  const hasData = document !== null && document.interview_count > 0;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto h-full">
      {/* Run button */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={hasData ? "outline" : "default"}
          disabled={isGenerating || triggering || completedInterviewCount === 0}
          onClick={runSynthesis}
          className="text-xs"
        >
          {isGenerating
            ? "Generating..."
            : hasData
            ? "Re-run Synthesis"
            : "Run Synthesis"}
        </Button>
        {completedInterviewCount === 0 && (
          <span className="text-xs text-muted-foreground">
            Complete an interview first
          </span>
        )}
        {status === "failed" && (
          <span className="text-xs text-destructive">Last run failed</span>
        )}
      </div>

      {/* Loading state */}
      {isGenerating && (
        <div className="space-y-2">
          <div className="h-2 w-full animate-pulse rounded bg-accent" />
          <div className="h-2 w-3/4 animate-pulse rounded bg-accent" />
          <div className="h-2 w-1/2 animate-pulse rounded bg-accent" />
          <p className="text-xs text-muted-foreground">
            Analyzing {completedInterviewCount} interview
            {completedInterviewCount !== 1 ? "s" : ""}...
          </p>
        </div>
      )}

      {/* Results */}
      {hasData && !isGenerating && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-accent/40 p-2 text-center">
              <p className="text-base font-semibold">{document.saturation_score}%</p>
              <p className="text-xs text-muted-foreground">Saturation</p>
            </div>
            <div className="rounded bg-accent/40 p-2 text-center">
              <p className="text-base font-semibold">{document.interview_count}</p>
              <p className="text-xs text-muted-foreground">Interviews</p>
            </div>
            <div className="rounded bg-accent/40 p-2 text-center">
              <p className="text-base font-semibold">{document.unique_pattern_count}</p>
              <p className="text-xs text-muted-foreground">Patterns</p>
            </div>
          </div>

          {/* Executive summary */}
          {summary && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </h3>
              <p className="text-xs leading-relaxed">{summary}</p>
            </section>
          )}

          {/* Pain points */}
          {painPoints.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pain Points
              </h3>
              <div className="space-y-2">
                {painPoints.map((p, i) => (
                  <div
                    key={i}
                    className="rounded border border-border bg-card/50 p-2 text-xs"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${severityClass(p.severity)}`}
                      >
                        {p.severity}
                      </Badge>
                      <span className="text-muted-foreground">×{p.frequency}</span>
                    </div>
                    <p>{p.description}</p>
                    {p.quotes[0] && (
                      <p className="mt-1 italic text-muted-foreground">
                        &ldquo;{p.quotes[0].text}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Patterns */}
          {patterns.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Patterns
              </h3>
              <div className="space-y-2">
                {patterns.map((p, i) => (
                  <div
                    key={i}
                    className="rounded border border-border bg-card/50 p-2 text-xs"
                  >
                    <p className="font-medium">{p.name}</p>
                    <p className="text-muted-foreground">{p.description}</p>
                    <p className="mt-1 text-muted-foreground/60">
                      {p.interviewIds.length} interview
                      {p.interviewIds.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key quotes */}
          {keyQuotes.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Key Quotes
              </h3>
              <div className="space-y-2">
                {keyQuotes.map((q, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-primary/50 pl-3 text-xs italic text-muted-foreground"
                  >
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasData && !isGenerating && (
        <p className="text-xs text-muted-foreground">
          {completedInterviewCount === 0
            ? "Complete interviews to unlock synthesis."
            : "Click Run Synthesis to analyze your interviews."}
        </p>
      )}
    </div>
  );
}
