import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseImportedContacts } from "@/lib/contact-import";

type ImportBody = {
  filename: string;
  content: string;
};

function contactKey(row: {
  email: string;
  linkedin_url: string;
  first_name: string;
  last_name: string;
  company: string;
}) {
  return [
    row.email.toLowerCase(),
    row.linkedin_url.toLowerCase(),
    `${row.first_name} ${row.last_name}`.trim().toLowerCase(),
    row.company.toLowerCase(),
  ].join("|");
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json()) as ImportBody;
  if (!body.filename || !body.content) {
    return Response.json(
      { error: "File name and content are required" },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseImportedContacts(body.filename, body.content);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not parse the file",
      },
      { status: 400 },
    );
  }

  if (parsed.length === 0) {
    return Response.json(
      { error: "No contacts were recognized in that file" },
      { status: 400 },
    );
  }

  const { data: existingRows } = await supabase
    .from("contacts")
    .select("email, linkedin_url, first_name, last_name, company")
    .eq("project_id", id);

  const existingKeys = new Set((existingRows ?? []).map(contactKey));
  const inserts = parsed
    .filter((row) => !existingKeys.has(contactKey(row)))
    .map((row) => ({
      project_id: id,
      source: row.source,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      title: row.title,
      company: row.company,
      linkedin_url: row.linkedin_url,
      company_website: row.company_website,
      industry: row.industry,
      location: row.location,
      source_payload: row.source_payload,
      research_brief: null,
      fit_score: null,
      fit_status: null,
      outreach_status: "pending" as const,
      email_draft: null,
      email_sent_at: null,
      persona_id: null,
    }));

  if (inserts.length > 0) {
    const { error } = await supabase.from("contacts").insert(inserts);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  await supabase
    .from("projects")
    .update({ outreach_status: "idle", outreach_progress: 0 })
    .eq("id", id);

  return Response.json({
    imported: inserts.length,
    skipped: parsed.length - inserts.length,
  });
}
