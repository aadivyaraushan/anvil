import { createClient } from "@supabase/supabase-js";

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!url || !serviceKey || !email || !password) {
    throw new Error(
      "globalSetup: missing env vars. Ensure NEXT_PUBLIC_SUPABASE_URL, " +
        "SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD are in .env.local"
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Idempotent: skip creation if user already exists
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = listData?.users.find((u) => u.email === email);
  if (existing) {
    console.log(`[global-setup] Test user already exists: ${email}`);
    return;
  }

  // email_confirm: true bypasses email verification — no inbox required
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`[global-setup] Failed to create test user: ${error.message}`);
  }

  console.log(`[global-setup] Created test user: ${data.user.id} (${email})`);
}
