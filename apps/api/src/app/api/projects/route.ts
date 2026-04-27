import type { NextRequest } from "next/server";

import {
  createUserSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";
import { assertWithinLimit } from "@/lib/billing/enforce";

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await assertWithinLimit(supabase, "project_create");
  if (!limit.ok) return limit.response;

  const body = (await req.json()) as {
    name?: string;
    idea_description?: string;
    target_profile?: string;
  };

  if (!body.name || !body.name.trim()) {
    return Response.json({ error: "Project name is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      idea_description: body.idea_description ?? "",
      target_profile: body.target_profile ?? "",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
