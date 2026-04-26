import type { NextRequest } from "next/server";
import {
  createUserSupabaseClient,
  createServiceSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const project_id = formData.get("project_id") as string | null;
  const attendee_name = formData.get("attendee_name") as string | null;
  const source = (formData.get("source") as string | null) ?? "uploaded";
  // When the recording was started from an existing conversation page,
  // the capsule passes the interview_id back so we append to that row
  // instead of inserting a brand-new conversation.
  const interview_id = formData.get("interview_id") as string | null;

  if (!file || !project_id) {
    return Response.json(
      { error: "Missing required fields: file, project_id" },
      { status: 400 }
    );
  }

  // Verify user owns the project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .single();

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const serviceSupabase = createServiceSupabaseClient();

  let interview: { id: string };

  if (interview_id) {
    // Append-to-existing path. Verify ownership via the user-scoped client
    // (RLS enforces project ownership) before letting the service role
    // mutate the row.
    const { data: existing } = await supabase
      .from("interviews")
      .select("id, project_id")
      .eq("id", interview_id)
      .single();

    if (!existing || existing.project_id !== project_id) {
      return Response.json(
        { error: "Interview not found or does not belong to project" },
        { status: 404 }
      );
    }

    const { error: updateError } = await serviceSupabase
      .from("interviews")
      .update({
        upload_status: "uploading" as const,
        // Flip to live so the canvas reflects "transcript landing soon"
        // while Deepgram works. We restore to "completed" once the
        // transcript is saved.
        status: "live" as const,
      })
      .eq("id", interview_id);

    if (updateError) {
      return Response.json({ error: "Failed to update interview" }, { status: 500 });
    }

    interview = { id: interview_id };
  } else {
    // Insert-new path (used by the dashboard's quick-capture button).
    const { data: created, error: insertError } = await serviceSupabase
      .from("interviews")
      .insert({
        project_id,
        source: source as "desktop" | "uploaded",
        attendee_name: attendee_name ?? null,
        attendee_company: null,
        meeting_platform: null,
        meeting_link: null,
        scheduled_at: null,
        status: "scheduled" as const,
        transcript: [],
        suggested_questions: [],
        upload_status: "uploading" as const,
      })
      .select()
      .single();

    if (insertError || !created) {
      return Response.json({ error: "Failed to create interview" }, { status: 500 });
    }

    interview = created;
  }

  // Upload audio file to Supabase storage
  const fileBuffer = await file.arrayBuffer();
  const storagePath = `${user.id}/${project_id}/${interview.id}/${file.name}`;

  const { error: uploadError } = await serviceSupabase.storage
    .from("recordings")
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    // Mark as failed if upload fails
    await serviceSupabase
      .from("interviews")
      .update({ upload_status: "failed" })
      .eq("id", interview.id);
    return Response.json({ error: "Storage upload failed" }, { status: 500 });
  }

  // Update recording path
  await serviceSupabase
    .from("interviews")
    .update({ recording_path: storagePath })
    .eq("id", interview.id);

  // Start Deepgram transcription asynchronously via REST API (SDK shape changes
  // across versions; the REST endpoint is stable).
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");

    const { data: signedData } = await serviceSupabase.storage
      .from("recordings")
      .createSignedUrl(storagePath, 3600);

    if (signedData?.signedUrl) {
      const params = new URLSearchParams({
        model: "nova-2",
        diarize: "true",
        punctuate: "true",
        utterances: "true",
      });

      // Fire and forget — transcription result handled via the resolved promise
      fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: signedData.signedUrl }),
      })
        .then((r) => r.json())
        .then(async (result: { results?: { utterances?: Array<{ speaker?: number; transcript?: string; start?: number }> } }) => {
          const utterances = result?.results?.utterances ?? [];
          const transcript = utterances.map((u) => ({
            speaker: `Speaker ${u.speaker ?? 0}`,
            text: u.transcript ?? "",
            timestamp: Math.round((u.start ?? 0) * 1000),
          }));

          await serviceSupabase
            .from("interviews")
            .update({
              transcript,
              upload_status: "done",
              status: "completed",
            })
            .eq("id", interview.id);
        })
        .catch(async () => {
          await serviceSupabase
            .from("interviews")
            .update({ upload_status: "failed" })
            .eq("id", interview.id);
        });
    }
  } catch (err) {
    console.error("[upload] Deepgram transcription start failed:", String(err));
    // Don't fail the request — interview row exists, transcription can be retried
  }

  return Response.json({ id: interview.id }, { status: 201 });
}
