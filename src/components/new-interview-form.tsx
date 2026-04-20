"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type {
  Contact,
  MeetingPlatform,
  Persona,
} from "@/lib/supabase/types";

type Props = {
  projectId: string;
  contacts: Contact[];
  personas: Persona[];
};

export function NewInterviewForm({ projectId, contacts, personas }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    contact_id: "",
    persona_id: "",
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
        body: JSON.stringify({
          ...form,
          contact_id: form.contact_id || null,
          persona_id: form.persona_id || null,
        }),
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
      className="grid gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-6"
    >
      <select
        value={form.contact_id}
        onChange={(e) => {
          const contactId = e.target.value;
          const selectedContact = contacts.find((contact) => contact.id === contactId);
          setForm((current) => ({
            ...current,
            contact_id: contactId,
            persona_id: selectedContact?.persona_id ?? current.persona_id,
          }));
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">No linked contact</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.company}
          </option>
        ))}
      </select>
      <select
        value={form.persona_id}
        onChange={(e) =>
          setForm((current) => ({ ...current, persona_id: e.target.value }))
        }
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">Unassigned archetype</option>
        {personas.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.name}
          </option>
        ))}
      </select>
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
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground md:col-span-2"
      />
      <input
        type="datetime-local"
        value={form.scheduled_at}
        onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
        required
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      />
      <Button type="submit" size="sm" disabled={loading} className="md:col-span-1">
        {loading ? "Saving..." : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
        className="md:col-span-1"
      >
        Cancel
      </Button>
    </form>
  );
}
