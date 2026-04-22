import type { NextRequest } from "next/server";
import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";
import { createDeepgramBrowserToken } from "@/lib/deepgram";

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const key = await createDeepgramBrowserToken();
    return Response.json({ key });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
