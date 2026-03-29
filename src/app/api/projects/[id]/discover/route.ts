import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildDiscoveryGraph } from "@/lib/agents/discovery/graph";
import type { DiscoveryState } from "@/lib/agents/discovery/state";
import type { Contact } from "@/lib/supabase/types";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch project (validates ownership via RLS)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Prevent double-trigger
  if (project.discovery_status === "running") {
    return Response.json(
      { error: "Discovery is already running" },
      { status: 409 }
    );
  }

  // Fetch user settings
  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // If resuming a partial run, fetch existing pending contacts
  const isResume = project.discovery_status === "partial";
  let existingContacts: Contact[] = [];

  if (isResume) {
    const { data: pending } = await supabase
      .from("contacts")
      .select("*")
      .eq("project_id", id)
      .eq("outreach_status", "pending");
    existingContacts = (pending ?? []) as Contact[];
  }

  // Mark as running
  await supabase
    .from("projects")
    .update({ discovery_status: "running" })
    .eq("id", id);

  const initialState: Partial<DiscoveryState> = {
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

  // Run agent in background after response is sent
  after(async () => {
    try {
      const graph = buildDiscoveryGraph();
      if (isResume && existingContacts.length > 10) {
        const batch = existingContacts.slice(0, 10);
        initialState.contacts = batch;
        await graph.invoke(initialState);
        // Check if more pending contacts remain
        const supabaseInner = await createServerSupabaseClient();
        const { data: remaining } = await supabaseInner
          .from("contacts")
          .select("id")
          .eq("project_id", id)
          .eq("outreach_status", "pending");
        if (remaining && remaining.length > 0) {
          await supabaseInner
            .from("projects")
            .update({ discovery_status: "partial" })
            .eq("id", id);
        }
      } else {
        await graph.invoke(initialState);
      }
    } catch (err) {
      const supabaseInner = await createServerSupabaseClient();
      await supabaseInner
        .from("projects")
        .update({ discovery_status: "idle" })
        .eq("id", id);
      console.error("Discovery agent failed:", err);
    }
  });

  return Response.json({ status: "started" });
}
