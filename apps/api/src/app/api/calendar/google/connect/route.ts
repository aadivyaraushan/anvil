import type { NextRequest } from "next/server";
import { google } from "googleapis";

import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";
import { mintOAuthState } from "@/lib/oauth-state";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Mint a single-use, time-limited state nonce stored server-side. The
  // callback verifies the nonce against oauth_states before trusting
  // any incoming OAuth code. This replaces the old base64-encoded
  // { user_id, token } blob, which leaked the user's Supabase bearer
  // token through Google + browser history + any redirect-side proxy.
  const serviceSupabase = createServiceSupabaseClient();
  const nonce = await mintOAuthState(serviceSupabase, user.id, "google");

  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
    prompt: "consent",
    state: nonce,
  });

  return Response.json({ url: authUrl });
}
