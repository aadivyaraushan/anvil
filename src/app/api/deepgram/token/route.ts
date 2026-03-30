import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDeepgramBrowserToken } from "@/lib/deepgram";

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const key = await createDeepgramBrowserToken();
    return Response.json({ key });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
