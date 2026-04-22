"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTauri } from "@/lib/hooks/use-tauri";
import { useProjects } from "@/lib/hooks/use-projects";
import { LiveDot } from "@/components/primitives/live-dot";

type RecordingState = {
  is_recording: boolean;
  duration_secs: number;
  project_id: string | null;
  attendee_name: string | null;
  recording_id: string | null;
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Waveform bars — purely decorative, animates while recording
function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-px h-5">
      {Array.from({ length: 36 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] transition-all duration-150"
          style={{
            height: active
              ? `${3 + Math.abs(Math.sin(Date.now() / 300 + i * 0.8)) * 14}px`
              : "3px",
            background:
              i > 30
                ? "oklch(0.70 0.18 20)" // rose
                : "oklch(0.60 0.010 264)", // muted
            opacity: active ? 0.6 + i / 70 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

export default function CapsulePage() {
  const { invoke, listen, isTauri } = useTauri();
  const { data: projects } = useProjects();
  const projectList = projects ?? [];

  const [recState, setRecState] = useState<RecordingState>({
    is_recording: false,
    duration_secs: 0,
    project_id: null,
    attendee_name: null,
    recording_id: null,
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tick, setTick] = useState(0);

  // Sync state from Tauri on mount
  useEffect(() => {
    invoke<RecordingState>("get_recording_state").then((s) => {
      if (s) setRecState(s);
    });
  }, [invoke]);

  // Listen for state-change events from Rust
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<RecordingState>("recording-started", (s) => setRecState(s)).then(
      (fn) => { unlisten = fn; }
    );
    return () => unlisten?.();
  }, [listen]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<RecordingState>("recording-stopped", (s) => setRecState(s)).then(
      (fn) => { unlisten = fn; }
    );
    return () => unlisten?.();
  }, [listen]);

  // Client-side timer tick for live duration display
  useEffect(() => {
    if (recState.is_recording) {
      timerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recState.is_recording]);

  const handleStart = useCallback(async () => {
    setError(null);
    const pid = selectedProjectId || projectList[0]?.id;
    if (!pid) {
      setError("Select a project first.");
      return;
    }
    const id = await invoke<string>("start_recording", {
      projectId: pid,
      attendeeName: null,
    });
    if (!id) setError("Could not start recording. Is the desktop app running?");
  }, [invoke, selectedProjectId, projectList]);

  const handleStop = useCallback(async () => {
    if (!recState.recording_id) return;
    setUploading(true);
    setError(null);
    try {
      const filePath = await invoke<string>("stop_recording", {
        recordingId: recState.recording_id,
      });

      // Upload recording to API
      const { getSupabase } = await import("@/lib/supabase/client");
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;

      const fd = new FormData();
      fd.append("file_path", filePath ?? "");
      fd.append("project_id", recState.project_id ?? "");
      fd.append("source", "desktop");
      if (recState.attendee_name) fd.append("attendee_name", recState.attendee_name);

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interviews/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    } catch (e) {
      setError("Upload failed. The recording is saved locally and will retry.");
      console.error(e);
    } finally {
      setUploading(false);
    }
  }, [invoke, recState]);

  const handleClose = useCallback(async () => {
    await invoke("hide_capsule");
  }, [invoke]);

  const displayDuration = recState.is_recording
    ? recState.duration_secs + tick
    : recState.duration_secs;

  const selectedProject = projectList.find(
    (p) => p.id === (recState.project_id ?? selectedProjectId)
  );

  return (
    <div
      className="w-[420px] h-[280px] flex flex-col bg-background rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {recState.is_recording ? (
          <LiveDot color="rose" />
        ) : (
          <span className="size-2 rounded-full bg-azure inline-block" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium tracking-tight leading-none">
            {recState.is_recording ? "Recording" : "Ready to record"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {recState.is_recording
              ? `${selectedProject?.name ?? "—"} · mic + system audio`
              : "Choose a project · ⌥⌘R to summon"}
          </div>
        </div>
        <span className="anvil-mono text-[13px] tabular-nums text-muted-foreground">
          {formatDuration(displayDuration)}
        </span>
        <button
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Waveform */}
      <div className="px-4">
        <WaveformBars active={recState.is_recording} />
      </div>

      {/* Project picker (not recording) */}
      {!recState.is_recording && projectList.length > 0 && (
        <div className="px-4 mt-3">
          <select
            value={selectedProjectId || projectList[0]?.id}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full h-7 text-[12px] bg-muted border border-border rounded-md px-2 text-foreground"
          >
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="px-4 mt-2 text-[11px] text-rose">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 px-4 mt-auto pb-4 pt-3">
        {recState.is_recording ? (
          <>
            <button
              className="flex-1 h-7 rounded-md border border-border text-[12.5px] text-muted-foreground hover:bg-muted transition-colors"
              onClick={() => {/* TODO: pause */}}
            >
              Pause
            </button>
            <button
              disabled={uploading}
              onClick={handleStop}
              className="flex-[2] h-7 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Stop & review"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleStart}
              disabled={!isTauri}
              className="flex-1 h-7 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <LiveDot size="sm" color="rose" />
              Start recording
            </button>
          </>
        )}
      </div>

      {!isTauri && (
        <p className="text-center text-[10px] text-muted-foreground pb-2">
          Recording requires the Anvil desktop app.
        </p>
      )}
    </div>
  );
}
