import type { NextRequest } from "next/server";

import {
  createUserSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // RLS scopes the delete to the caller's projects. All child FKs
  // (interviews, analyst_documents, personas, contacts) are declared
  // ON DELETE CASCADE in the initial schema, so a single delete here
  // tears down the whole project graph.
  const { data: deleted, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!deleted || deleted.length === 0) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
