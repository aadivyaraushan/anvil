/**
 * End-to-end integration test for the recordings → interviews path.
 *
 * This is the test that would have caught the production 500. It hits a real
 * Supabase test project: writes a real `interviews` row, uploads a tiny WAV
 * to the real `recordings` bucket, and asserts the API contract.
 *
 * Skipped automatically unless INTEGRATION_TEST=1. See ./README.md.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createTestProject,
  describeIntegration,
  getServiceClient,
  integrationEnabled,
} from "./harness";

describeIntegration("interviews upload — real Supabase", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let project: { id: string; cleanup: () => Promise<void> };

  beforeAll(async () => {
    if (!integrationEnabled) return;
    supabase = getServiceClient();
    project = await createTestProject(supabase);
  });

  afterAll(async () => {
    if (project) await project.cleanup();
  });

  it("inserts an interview row with all required columns populated", async () => {
    // Mirrors the exact insert shape the upload route uses. If a NOT NULL
    // column is added to `interviews` and the route doesn't populate it,
    // this fails immediately with the real Postgres error.
    const { data, error } = await supabase
      .from("interviews")
      .insert({
        project_id: project.id,
        source: "desktop",
        attendee_name: null,
        attendee_company: null,
        meeting_platform: null,
        meeting_link: null,
        scheduled_at: null,
        status: "scheduled",
        transcript: [],
        suggested_questions: [],
        upload_status: "uploading",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      project_id: project.id,
      source: "desktop",
      upload_status: "uploading",
    });
  });

  it("can write to the recordings bucket under the user-id prefix", async () => {
    const userId = process.env.TEST_USER_ID!;
    const path = `${userId}/${project.id}/probe-${Date.now()}/probe.wav`;
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"

    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(path, bytes, { contentType: "audio/wav", upsert: false });

    expect(
      uploadError,
      // The bug the user hit: bucket missing or RLS denies service role.
      `recordings bucket write failed — likely cause of the prod 500: ${uploadError?.message}`
    ).toBeNull();

    // Cleanup — afterAll only sweeps paths recorded on interviews rows.
    await supabase.storage.from("recordings").remove([path]);
  });
});
