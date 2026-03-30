"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { MeetingPlatform } from "@/lib/supabase/types";

type Props = { projectId: string };

export function NewInterviewForm({ projectId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    meeting_platform: "zoom" as MeetingPlatform,
    meeting_link: "",
    scheduled_at: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contact_id: null }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Schedule Interview
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
    >
      <select
        value={form.meeting_platform}
        onChange={(e) =>
          setForm((f) => ({ ...f, meeting_platform: e.target.value as MeetingPlatform }))
        }
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="zoom">Zoom</option>
        <option value="google_meet">Google Meet</option>
      </select>
      <input
        type="url"
        placeholder="Meeting link"
        value={form.meeting_link}
        onChange={(e) => setForm((f) => ({ ...f, meeting_link: e.target.value }))}
        required
        className="w-48 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
      />
      <input
        type="datetime-local"
        value={form.scheduled_at}
        onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
        required
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
