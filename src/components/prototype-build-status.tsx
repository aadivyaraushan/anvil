"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { PrototypeStatus } from "@/lib/supabase/types";

type Props = {
  projectId: string;
  initialStatus: PrototypeStatus;
  initialPhase: string | null;
  projectName: string;
  createdAt: string;
};

const STALE_BUILD_MS = 2 * 60 * 1000;

const PHASE_LABELS: Record<string, string> = {
  starting: "Initializing...",
  architect: "Architect designing spec...",
  "ux-designer": "UX Designer creating design brief...",
  developer: "Developer generating code...",
  building: "Verifying build in sandbox...",
  reviewer: "Reviewer checking quality...",
  deploying: "Publishing live prototype...",
  deployed: "Deployed!",
};

const PHASE_ORDER = [
  "starting",
  "architect",
  "ux-designer",
  "developer",
  "building",
  "reviewer",
  "deploying",
];

export function PrototypeBuildStatus({
  projectId,
  initialStatus,
  initialPhase,
  projectName,
  createdAt,
}: Props) {
  const [status, setStatus] = useState<PrototypeStatus>(initialStatus);
  const [phase, setPhase] = useState<string | null>(initialPhase);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`prototype-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          const updated = payload.new as {
            prototype_status: PrototypeStatus;
            prototype_phase: string | null;
          };
          setStatus(updated.prototype_status);
          setPhase(updated.prototype_phase);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const normalizedPhase =
    phase && PHASE_ORDER.includes(phase)
      ? phase
      : status === "generating"
      ? "starting"
      : phase;
  const currentPhaseIndex = PHASE_ORDER.indexOf(normalizedPhase ?? "");
  const isFailed = status === "failed";
  const isDeployed = status === "deployed";
  const isStaleGenerating =
    status === "generating" &&
    Date.now() - new Date(createdAt).getTime() > STALE_BUILD_MS;
  const canRetry = isFailed || isStaleGenerating;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h2 className="text-lg font-semibold">
            {isDeployed ? "Prototype ready" : "Building your prototype"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isDeployed
              ? `${projectName} prototype is live and the source has been pushed to GitHub.`
              : `Generating a functional MVP for ${projectName}...`}
          </p>
        </div>

        {/* Phase progress */}
        {!isDeployed && !isFailed && (
          <div className="space-y-2">
            {PHASE_ORDER.map((p, i) => {
              const isDone = i < currentPhaseIndex;
              const isActive = p === normalizedPhase;
              return (
                <div
                  key={p}
                  className={`flex items-center gap-3 text-sm ${
                    isDone
                      ? "text-muted-foreground"
                      : isActive
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  <span className="w-4 shrink-0">
                    {isDone ? "✓" : isActive ? "→" : "○"}
                  </span>
                  <span className={isActive ? "font-medium" : ""}>
                    {PHASE_LABELS[p] ?? p}
                  </span>
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Status message */}
        <p className="text-sm">
          {isFailed ? (
            <span className="text-destructive">
              {phase?.startsWith("Error:") ? phase : "Build failed. Check your API keys in settings."}
            </span>
          ) : normalizedPhase ? (
            <span className="text-muted-foreground animate-pulse">
              {PHASE_LABELS[normalizedPhase] ?? normalizedPhase}
            </span>
          ) : null}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          {canRetry && (
            <Button
              size="sm"
              onClick={async () => {
                const url = isStaleGenerating
                  ? `/api/projects/${projectId}/prototype?force=1`
                  : `/api/projects/${projectId}/prototype`;
                await fetch(url, {
                  method: "POST",
                });
              }}
            >
              {isStaleGenerating ? "Restart build" : "Retry"}
            </Button>
          )}
          <Link href={`/project/${projectId}/settings`}>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
