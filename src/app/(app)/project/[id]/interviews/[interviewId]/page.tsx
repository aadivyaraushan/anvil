"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { DeepgramClient } from "@deepgram/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Interview } from "@/lib/supabase/types";

type TranscriptChunk = {
  speaker: string;
  text: string;
  timestamp: number;
};

export default function InterviewWorkspacePage() {
  const { id, interviewId } = useParams<{ id: string; interviewId: string }>();
  const router = useRouter();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const startTimeRef = useRef<number>(0);
  const transcriptRef = useRef<TranscriptChunk[]>([]);
  const lastSavedLengthRef = useRef(0);
  const lastCopilotLengthRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copilotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    fetch(`/api/projects/${id}/interviews/${interviewId}`)
      .then((r) => r.json())
      .then((data: Interview) => {
        setInterview(data);
        setTranscript((data.transcript as TranscriptChunk[]) ?? []);
        setSuggestions((data.suggested_questions as string[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, interviewId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const current = transcriptRef.current;
      if (current.length === lastSavedLengthRef.current) return;
      await fetch(`/api/projects/${id}/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: current }),
      });
      lastSavedLengthRef.current = current.length;
    }, 5000);
  }, [id, interviewId]);

  const fetchSuggestions = useCallback(async () => {
    const current = transcriptRef.current;
    if (current.length - lastCopilotLengthRef.current < 3) return;
    lastCopilotLengthRef.current = current.length;
    setSuggestionsLoading(true);

    const newSuggestions: string[] = [];
    let buffer = "";

    try {
      const res = await fetch(
        `/api/projects/${id}/interviews/${interviewId}/copilot`
      );
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") break;
          try {
            const { text } = JSON.parse(payload) as { text: string };
            newSuggestions.push(text);
            setSuggestions(
              newSuggestions
                .join("")
                .split("\n")
                .filter((l) => l.trim())
            );
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id, interviewId]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const res = await fetch("/api/deepgram/token");
    const { key } = (await res.json()) as { key: string };

    const deepgram = new DeepgramClient({ apiKey: key });
    const socket = await deepgram.listen.v1.connect({
      model: "nova-2",
      language: "en-US",
      smart_format: "true",
      interim_results: "true",
      Authorization: `Token ${key}`,
    });
    socketRef.current = socket;

    startTimeRef.current = Date.now();

    socket.on("open", () => {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) socket.sendMedia(e.data);
      });
      mediaRecorder.start(250);
    });

    socket.on("message", (message) => {
      if (message.type !== "Results") return;
      const resultsMsg = message;
      const text = resultsMsg.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text || !resultsMsg.is_final) return;
      const chunk: TranscriptChunk = {
        speaker: "interviewer",
        text,
        timestamp: Date.now() - startTimeRef.current,
      };
      setTranscript((prev) => {
        const next = [...prev, chunk];
        transcriptRef.current = next;
        return next;
      });
      scheduleSave();
    });

    await fetch(`/api/projects/${id}/interviews/${interviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "live" }),
    });
    setInterview((prev) => (prev ? { ...prev, status: "live" } : prev));
    setIsRecording(true);
    copilotTimerRef.current = setInterval(fetchSuggestions, 30_000);
  }

  async function stopRecording() {
    setIsRecording(false);
    if (copilotTimerRef.current) clearInterval(copilotTimerRef.current);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    await fetch(`/api/projects/${id}/interviews/${interviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: transcriptRef.current }),
    });
  }

  async function completeInterview() {
    await stopRecording();
    await fetch(`/api/projects/${id}/interviews/${interviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    router.push(`/project/${id}/interviews`);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading interview...</p>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Interview not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/project/${id}/interviews`}>
            <Button variant="ghost" size="sm">
              &larr;
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-semibold">
              Interview &mdash;{" "}
              {new Date(interview.scheduled_at).toLocaleDateString()}
            </h1>
            <p className="text-xs text-muted-foreground">
              {interview.meeting_link}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={interview.status === "live" ? "default" : "secondary"}
            className="capitalize"
          >
            {interview.status}
          </Badge>
          {interview.status !== "completed" && (
            <>
              {!isRecording ? (
                <Button size="sm" onClick={startRecording}>
                  Start Recording
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={stopRecording}>
                  Pause
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={completeInterview}>
                Complete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-border overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="border-b px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Transcript
            </h2>
          </div>
          <div className="flex-1 space-y-2 overflow-auto p-4 font-mono text-xs">
            {transcript.length === 0 && (
              <p className="text-muted-foreground">
                {isRecording
                  ? "Listening... speak to see transcript."
                  : "Press Start Recording to begin transcription."}
              </p>
            )}
            {transcript.map((chunk, i) => (
              <div key={i} className="flex gap-2">
                <span className="w-20 shrink-0 text-muted-foreground">
                  [{chunk.speaker}]
                </span>
                <span className="text-foreground">{chunk.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Copilot Suggestions
            </h2>
            <div className="flex items-center gap-2">
              {suggestionsLoading && (
                <span className="animate-pulse text-[10px] text-muted-foreground">
                  Thinking...
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={fetchSuggestions}
                disabled={suggestionsLoading}
              >
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-auto p-4">
            {suggestions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {interview.status === "completed"
                  ? "Interview complete."
                  : "Suggestions will appear after 3+ transcript lines (or click Refresh)."}
              </p>
            )}
            {suggestions.map((q, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-card p-3 text-xs text-foreground"
              >
                {i + 1}. {q}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
