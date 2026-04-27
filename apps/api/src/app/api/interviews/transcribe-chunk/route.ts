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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  const interview_id = formData.get("interview_id") as string | null;
  const time_offset_secs = parseInt(
    (formData.get("time_offset_secs") as string | null) ?? "0",
    10
  );

  if (!audio || !interview_id) {
    return Response.json(
      { error: "Missing required fields: audio, interview_id" },
      { status: 400 }
    );
  }

  // Verify ownership via RLS-scoped client.
  const { data: interview } = await supabase
    .from("interviews")
    .select("id, project_id, transcript, status")
    .eq("id", interview_id)
    .single();

  if (!interview) {
    return Response.json({ error: "Interview not found" }, { status: 404 });
  }

  const serviceSupabase = createServiceSupabaseClient();

  // On the first chunk, flip the interview to live so the canvas shows the
  // "Recording" indicator immediately rather than waiting for transcription.
  if (interview.status === "scheduled") {
    await serviceSupabase
      .from("interviews")
      .update({ status: "live", upload_status: "uploading" })
      .eq("id", interview_id);
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json({ segments: [] });
  }

  const params = new URLSearchParams({
    model: "nova-2",
    diarize: "true",
    punctuate: "true",
    utterances: "true",
  });

  let dgResult: {
    results?: {
      utterances?: Array<{
        speaker?: number;
        transcript?: string;
        start?: number;
      }>;
    };
  };

  try {
    const audioBuffer = await audio.arrayBuffer();
    const dgRes = await fetch(
      `https://api.deepgram.com/v1/listen?${params}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audio.type || "audio/webm",
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const body = await dgRes.text().catch(() => "");
      console.error(`[transcribe-chunk] Deepgram ${dgRes.status}: ${body.slice(0, 200)}`);
      return Response.json({ segments: [] });
    }
    dgResult = await dgRes.json();
  } catch (err) {
    console.error("[transcribe-chunk] Deepgram fetch error:", err);
    return Response.json({ segments: [] });
  }

  const utterances = dgResult?.results?.utterances ?? [];
  const newSegments = utterances
    .filter((u) => (u.transcript ?? "").trim().length > 0)
    .map((u) => ({
      speaker: `Speaker ${u.speaker ?? 0}`,
      text: u.transcript ?? "",
      // Deepgram returns seconds; add the chunk offset then convert to ms
      // to match the transcript schema used by the batch upload route.
      timestamp: Math.round(((u.start ?? 0) + time_offset_secs) * 1000),
    }));

  if (newSegments.length > 0) {
    const existing = (
      interview.transcript as Array<{
        speaker: string;
        text: string;
        timestamp: number;
      }>
    ) ?? [];

    // `.select("id")` forces the response to surface a 0-row update — without
    // it, an update that matches no rows (e.g. interview deleted mid-stream)
    // returns `error: null` and we'd silently drop the chunk's transcript.
    const { error: updateError, data: updatedRows } = await serviceSupabase
      .from("interviews")
      .update({ transcript: [...existing, ...newSegments] })
      .eq("id", interview_id)
      .select("id");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      console.error(
        "[transcribe-chunk] transcript update failed:",
        updateError ?? "no rows updated"
      );
      return Response.json(
        {
          error: "Failed to persist transcript chunk",
          stage: "transcript_update",
          detail: updateError?.message ?? "no rows updated",
          code: updateError?.code ?? null,
        },
        { status: 500 }
      );
    }
  }

  return Response.json({ segments: newSegments }, { status: 200 });
}
