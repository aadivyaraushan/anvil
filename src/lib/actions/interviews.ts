"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Interview, InterviewStatus, MeetingPlatform } from "@/lib/supabase/types";

export async function getInterviews(projectId: string): Promise<Interview[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("project_id", projectId)
    .order("scheduled_at", { ascending: false });

  if (error) throw error;
  return data as Interview[];
}

export async function getInterview(id: string): Promise<Interview> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Interview;
}

export async function createInterview(params: {
  projectId: string;
  contactId: string | null;
  meetingPlatform: MeetingPlatform;
  meetingLink: string;
  scheduledAt: string;
}): Promise<Interview> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      project_id: params.projectId,
      contact_id: params.contactId,
      meeting_platform: params.meetingPlatform,
      meeting_link: params.meetingLink,
      scheduled_at: params.scheduledAt,
      status: "scheduled" as const,
      transcript: [],
      suggested_questions: [],
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath(`/project/${params.projectId}/interviews`);
  return data as Interview;
}

export async function updateInterviewStatus(
  id: string,
  status: InterviewStatus
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("interviews")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function saveTranscript(
  id: string,
  transcript: Array<{ speaker: string; text: string; timestamp: number }>
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("interviews")
    .update({ transcript })
    .eq("id", id);
  if (error) throw error;
}

export async function saveSuggestions(
  id: string,
  suggestions: string[]
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("interviews")
    .update({ suggested_questions: suggestions })
    .eq("id", id);
  if (error) throw error;
}
