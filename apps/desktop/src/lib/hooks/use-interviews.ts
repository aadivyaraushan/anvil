import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import type {
  Interview,
  InterviewSource,
  InterviewStatus,
  MeetingPlatform,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const interviewKeys = {
  list: (projectId: string) => ["interviews", projectId] as const,
  detail: (interviewId: string) => ["interview", interviewId] as const,
};

// ---------------------------------------------------------------------------
// Grouped helper (client-side)
// ---------------------------------------------------------------------------

export type GroupedInterviews = Record<
  string,
  { source: InterviewSource; status: InterviewStatus; items: Interview[] }
>;

function groupInterviews(interviews: Interview[]): GroupedInterviews {
  const groups: GroupedInterviews = {};
  for (const interview of interviews) {
    const key = `${interview.source}__${interview.status}`;
    if (!groups[key]) {
      groups[key] = { source: interview.source, status: interview.status, items: [] };
    }
    groups[key].items.push(interview);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useInterviews(projectId: string) {
  return useQuery({
    queryKey: interviewKeys.list(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .eq("project_id", projectId)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      const interviews = data as Interview[];
      return {
        interviews,
        grouped: groupInterviews(interviews),
      };
    },
    enabled: Boolean(projectId),
    // Server-side pipelines (Deepgram transcription, analyst document
    // generation) write rows out-of-band. Re-fetch every time the
    // workspace mounts so users don't sit on stale "uploading" rows
    // long after the transcript has actually landed.
    refetchOnMount: "always",
  });
}

export function useInterview(interviewId: string) {
  return useQuery({
    queryKey: interviewKeys.detail(interviewId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .eq("id", interviewId)
        .single();
      if (error) throw error;
      return data as Interview;
    },
    enabled: Boolean(interviewId),
    refetchOnMount: "always",
  });
}

export function useCreateInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      personaId: string | null;
      source: InterviewSource;
      meetingPlatform: MeetingPlatform | null;
      meetingLink: string | null;
      attendeeName: string | null;
      attendeeCompany: string | null;
      scheduledAt: string | null;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          project_id: params.projectId,
          persona_id: params.personaId,
          source: params.source,
          meeting_platform: params.meetingPlatform,
          meeting_link: params.meetingLink,
          attendee_name: params.attendeeName,
          attendee_company: params.attendeeCompany,
          scheduled_at: params.scheduledAt,
          status: "scheduled" as const,
          transcript: [],
          suggested_questions: [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as Interview;
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.list(params.projectId) });
    },
  });
}

export function useUpdateInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      projectId: string;
      updates: Partial<Omit<Interview, "id" | "created_at">>;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("interviews")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Interview;
    },
    onSuccess: (data, { projectId }) => {
      queryClient.setQueryData<Interview>(interviewKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: interviewKeys.list(projectId) });
    },
  });
}

export function useDeleteInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("interviews")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id, { projectId }) => {
      queryClient.setQueryData<{ interviews: Interview[]; grouped: GroupedInterviews }>(
        interviewKeys.list(projectId),
        (old) => {
          if (!old) return old;
          const interviews = old.interviews.filter((i) => i.id !== id);
          return { interviews, grouped: groupInterviews(interviews) };
        }
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Upload queue
// ---------------------------------------------------------------------------

export function useQueueUpload(interviewId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      audioBlob,
    }: {
      projectId: string;
      audioBlob: Blob;
    }) => {
      const supabase = getSupabase();

      // 1. Mark the row as queued
      const { data, error } = await supabase
        .from("interviews")
        .update({ upload_status: "queued" })
        .eq("id", interviewId)
        .select()
        .single();
      if (error) throw error;
      const updated = data as Interview;

      // 2. Get the current JWT and post the audio to the upload endpoint
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const formData = new FormData();
      formData.append("audio", audioBlob, `interview-${interviewId}.webm`);
      formData.append("interview_id", interviewId);

      const response = await fetch(`${apiUrl}/interviews/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${response.status} ${text}`);
      }

      return updated;
    },
    onSuccess: (updated, { projectId }) => {
      queryClient.setQueryData<Interview>(interviewKeys.detail(interviewId), updated);
      queryClient.invalidateQueries({ queryKey: interviewKeys.list(projectId) });
    },
  });
}
