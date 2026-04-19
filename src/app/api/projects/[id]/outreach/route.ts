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

  const isResume = project.outreach_status === "partial";
  let existingContacts: Contact[] = [];

  if (isResume) {
    const { data: pending } = await supabase
      .from("contacts")
      .select("*")
      .eq("project_id", id)
      .eq("outreach_status", "pending");
    existingContacts = (pending ?? []) as Contact[];
  }

  await supabase
    .from("projects")
    .update({ outreach_status: "running" })
    .eq("id", id);

  const initialState: Partial<OutreachState> = {
    projectId: id,
    targetProfile: project.target_profile,
    ideaDescription: project.idea_description,
    senderName: settings?.sender_name ?? "",
    senderEmail: settings?.sender_email ?? "",
    autoSendEnabled: settings?.auto_send_enabled ?? false,
    contacts: isResume ? existingContacts : [],
    currentIndex: 0,
    errors: [],
  };

  after(async () => {
    try {
      const graph = buildOutreachGraph();
      if (isResume && existingContacts.length > 10) {
        const batch = existingContacts.slice(0, 10);
        initialState.contacts = batch;
        await graph.invoke(initialState);
        const supabaseInner = await createServerSupabaseClient();
        const { data: remaining } = await supabaseInner
          .from("contacts")
          .select("id")
          .eq("project_id", id)
          .eq("outreach_status", "pending");
        if (remaining && remaining.length > 0) {
          await supabaseInner
            .from("projects")
            .update({ outreach_status: "partial" })
            .eq("id", id);
        }
      } else {
        await graph.invoke(initialState);
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
