import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildOutreachGraph } from "@/lib/agents/outreach/graph";
import type { OutreachState } from "@/lib/agents/outreach/state";
import type { Contact } from "@/lib/supabase/types";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.archetypes_verified) {
    return Response.json(
      { error: "Confirm your archetypes before running outreach." },
      { status: 409 }
    );
  }

  if (project.outreach_status === "running") {
    return Response.json(
      { error: "Outreach is already running" },
      { status: 409 }
    );
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const { data: contactRows } = await supabase
    .from("contacts")
    .select("*")
    .eq("project_id", id)
    .order("company", { ascending: true })
    .order("first_name", { ascending: true });

  const existingContacts = ((contactRows ?? []) as Contact[]).filter(
    (contact) =>
      contact.fit_score === null ||
      (contact.fit_status === "passed" && contact.outreach_status === "pending")
  );

  if (existingContacts.length === 0) {
    return Response.json(
      { error: "Import new contacts before running outreach." },
      { status: 400 }
    );
  }

  await supabase
    .from("projects")
    .update({ outreach_status: "running", outreach_progress: 0 })
    .eq("id", id);

  const batch = existingContacts.slice(0, 10);
  const initialState: Partial<OutreachState> = {
    projectId: id,
    targetProfile: project.target_profile,
    ideaDescription: project.idea_description,
    senderName: settings?.sender_name ?? "",
    senderEmail: settings?.sender_email ?? "",
    autoSendEnabled: settings?.auto_send_enabled ?? false,
    contacts: batch,
    personas: [],
    currentIndex: 0,
    errors: [],
  };

  after(async () => {
    try {
      const graph = buildOutreachGraph();
      await graph.invoke(initialState);

      const supabaseInner = await createServerSupabaseClient();
      const { data: remaining } = await supabaseInner
        .from("contacts")
        .select("id, fit_score, fit_status, outreach_status")
        .eq("project_id", id);

      const hasRemaining = (remaining ?? []).some(
        (contact) =>
          contact.fit_score === null ||
          (contact.fit_status === "passed" &&
            contact.outreach_status === "pending")
      );

      if (hasRemaining) {
        await supabaseInner
          .from("projects")
          .update({ outreach_status: "partial" })
          .eq("id", id);
      }
    } catch (err) {
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("projects")
        .update({ outreach_status: "idle" })
        .eq("id", id);
      console.error("Outreach agent failed:", err);
    }
  });

  return Response.json({ status: "started" });
}
