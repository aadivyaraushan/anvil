-- OAuth state nonce storage for CSRF protection.
-- Replaces the base64-encoded { user_id, token } blob the connect route
-- previously stuffed into the OAuth `state` param — that blob leaked the
-- user's Supabase bearer token through Google's URL + browser history +
-- any logging proxy on the redirect.
--
-- Flow:
--   1. /api/calendar/google/connect (auth'd) inserts a row with a fresh
--      UUID nonce, user_id, provider, expires_at=now()+10min, returns
--      the auth URL with state=<nonce>.
--   2. Google redirects to /api/calendar/google/callback?state=<nonce>.
--      Callback looks up the row by nonce, rejects if missing/expired,
--      uses the stored user_id to upsert calendar_connections, deletes
--      the row to prevent replay.
CREATE TABLE IF NOT EXISTS oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  nonce text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_nonce_idx ON oauth_states (nonce);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at);

-- RLS: service role only. Anon/auth'd users have no business reading
-- or writing these rows directly — the api routes use the service role.
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
