import { createServerSupabaseClient } from "@/lib/supabase/server";

type PrototypeProjectUpdate = {
  prototype_status?: "pending" | "generating" | "deployed" | "failed";
  prototype_phase?: string | null;
  prototype_repo_url?: string | null;
  prototype_url?: string | null;
};

function isMissingColumnError(
  error: { message?: string } | null,
  column: string
) {
  return Boolean(
    error?.message?.includes(`Could not find the '${column}' column`)
  );
}

export async function updatePrototypeProject(
  projectId: string,
  updates: PrototypeProjectUpdate
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  let payload: PrototypeProjectUpdate = { ...updates };
  let { error } = await supabase.from("projects").update(payload).eq("id", projectId);

  if (!error) return;

  if (
    payload.prototype_phase !== undefined &&
    isMissingColumnError(error, "prototype_phase")
  ) {
    const { prototype_phase: _prototypePhase, ...withoutPhase } = payload;
    payload = withoutPhase;
    ({ error } = await supabase.from("projects").update(payload).eq("id", projectId));
    if (!error) return;
  }

  throw error;
}
