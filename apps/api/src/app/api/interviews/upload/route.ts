import type { NextRequest } from "next/server";
import { after } from "next/server";
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
      console.error("[upload] interviews update failed:", updateError);
      return Response.json(
        {
          error: "Failed to update interview",
          stage: "interviews_update",
          detail: updateError.message ?? null,
          code: updateError.code ?? null,
        },
        { status: 500 }
      );
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
      console.error("[upload] interviews insert failed:", insertError);
      return Response.json(
        {
          error: "Failed to create interview",
          stage: "interviews_insert",
          detail: insertError?.message ?? null,
          code: insertError?.code ?? null,
        },
        { status: 500 }
      );
    }

    interview = created;
  }

  // Upload audio file to Supabase storage
  const fileBuffer = await file.arrayBuffer();
  const storagePath = `${user.id}/${project_id}/${interview.id}/${file.name}`;

  // Strip the `;codecs=...` parameter — Chromium MediaRecorder labels chunks
  // as `audio/webm;codecs=opus`, but Supabase Storage's MIME allowlist only
  // matches the bare type. Without this, every Chromium recording 415s.
  const rawMime = file.type || "audio/mpeg";
  const contentType = rawMime.split(";")[0].trim() || "audio/mpeg";

  const { error: uploadError } = await serviceSupabase.storage
    .from("recordings")
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[upload] storage upload failed:", uploadError);
    // Mark as failed AND drop status back to 'scheduled' — without the status
    // reset, the UI sees status='live' from the earlier flip and shows "End
    // conversation" instead of "Start recording", stranding the user.
    await serviceSupabase
      .from("interviews")
      .update({ upload_status: "failed", status: "scheduled" })
      .eq("id", interview.id);
    return Response.json(
      {
        error: "Storage upload failed",
        stage: "storage_upload",
        detail: uploadError.message ?? null,
      },
      { status: 500 }
    );
  }

  // Update recording path
  await serviceSupabase
    .from("interviews")
    .update({ recording_path: storagePath })
    .eq("id", interview.id);

  // Kick off Deepgram transcription via Next's `after()` so the work runs
  // after the response is sent but before the function exits. On serverless
  // (Vercel), a bare fire-and-forget promise is killed the instant
  // Response.json returns — that was the reason transcripts never landed.
  after(
    transcribeAndPersist({
      storagePath,
      interviewId: interview.id,
    })
  );

  return Response.json({ id: interview.id }, { status: 201 });
}

// ── Transcription background work ───────────────────────────────────────
// Pulled out of POST so `after()` gets a single promise to await and so
// the failure surface is uniform: every exit path leaves the interview
// row in a sane state (`done`, `failed`, or `completed`).
async function transcribeAndPersist(args: {
  storagePath: string;
  interviewId: string;
}): Promise<void> {
  const { storagePath, interviewId } = args;
  const serviceSupabase = createServiceSupabaseClient();

  const markFailed = async (reason: string) => {
    console.error(`[upload] transcription failed for ${interviewId}: ${reason}`);
    await serviceSupabase
      .from("interviews")
      .update({
        upload_status: "failed",
        // Don't leave the row stuck at status='live' — that strands the
        // canvas on "Listening…" forever. Bump it back to scheduled so
        // the user can retry.
        status: "scheduled",
      })
      .eq("id", interviewId);
  };

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    await markFailed("DEEPGRAM_API_KEY is not set");
    return;
  }

  const { data: signedData, error: signedErr } = await serviceSupabase.storage
    .from("recordings")
    .createSignedUrl(storagePath, 3600);
  if (signedErr || !signedData?.signedUrl) {
    await markFailed(`createSignedUrl failed: ${signedErr?.message ?? "no url"}`);
    return;
  }

  const params = new URLSearchParams({
    model: "nova-2",
    diarize: "true",
    punctuate: "true",
    utterances: "true",
  });

  let result: {
    results?: {
      utterances?: Array<{ speaker?: number; transcript?: string; start?: number }>;
    };
  };
  try {
    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: signedData.signedUrl }),
    });
    if (!dgRes.ok) {
      const body = await dgRes.text().catch(() => "");
      await markFailed(`Deepgram ${dgRes.status}: ${body.slice(0, 200)}`);
      return;
    }
    result = await dgRes.json();
  } catch (err) {
    await markFailed(`Deepgram fetch threw: ${String(err)}`);
    return;
  }

  const utterances = result?.results?.utterances ?? [];
  const transcript = utterances.map((u) => ({
    speaker: `Speaker ${u.speaker ?? 0}`,
    text: u.transcript ?? "",
    timestamp: Math.round((u.start ?? 0) * 1000),
  }));

  // `.select("id")` makes a 0-row update observable. Without it, if the
  // interview was deleted (or never existed under this id), `.update()`
  // returns `error: null` and we'd report success while writing nothing.
  const { error: persistErr, data: persistedRows } = await serviceSupabase
    .from("interviews")
    .update({
      transcript,
      upload_status: "done",
      status: "completed",
    })
    .eq("id", interviewId)
    .select("id");

  if (persistErr) {
    await markFailed(`persist transcript failed: ${persistErr.message}`);
  } else if (!persistedRows || persistedRows.length === 0) {
    await markFailed("persist transcript affected 0 rows");
  }
}
