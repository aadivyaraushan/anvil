/**
 * Integration-test harness.
 *
 * Tests opt in via INTEGRATION_TEST=1 and require a real Supabase test
 * project. Without those env vars, `describeIntegration` becomes
 * `describe.skip` so `pnpm test:integration` is safe to run anywhere.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_USER_ID",
] as const;

export const integrationEnabled =
  process.env.INTEGRATION_TEST === "1" &&
  REQUIRED.every((k) => typeof process.env[k] === "string" && process.env[k]!.length > 0);

/** describe.skip when INTEGRATION_TEST is unset; otherwise normal describe. */
export const describeIntegration = integrationEnabled ? describe : describe.skip;

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Creates a project owned by TEST_USER_ID. Returns the project id and a
 * cleanup function that deletes the project and any cascaded rows.
 */
export async function createTestProject(
  supabase: SupabaseClient,
  name = `__test ${new Date().toISOString()}`
): Promise<{ id: string; cleanup: () => Promise<void> }> {
  const userId = process.env.TEST_USER_ID!;
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name,
      target_profile: "test profile",
      idea_description: "test idea",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createTestProject failed: ${error?.message ?? "unknown"}`);
  }
  const id = data.id as string;
  return {
    id,
    cleanup: async () => {
      // Sweep child rows then the project itself. Order matters: storage
      // objects under the project's prefix should be removed first so the
      // bucket doesn't accumulate orphans.
      const { data: interviews } = await supabase
        .from("interviews")
        .select("id, recording_path")
        .eq("project_id", id);
      const paths = (interviews ?? [])
        .map((i: { recording_path: string | null }) => i.recording_path)
        .filter((p): p is string => Boolean(p));
      if (paths.length) {
        await supabase.storage.from("recordings").remove(paths);
      }
      await supabase.from("interviews").delete().eq("project_id", id);
      await supabase.from("personas").delete().eq("project_id", id);
      await supabase.from("projects").delete().eq("id", id);
    },
  };
}
