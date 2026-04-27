// Supabase types — updated for redesign (migrations 009 + 010)
// Outreach / contacts removed; interview source + calendar connections added.

export type PersonaStatus = "suggested" | "confirmed";
export type MeetingPlatform = "zoom" | "google_meet";
export type InterviewStatus = "scheduled" | "live" | "completed";
export type InterviewSource = "desktop" | "cal" | "inperson" | "uploaded" | "meet_link";
export type UploadStatus = "none" | "queued" | "uploading" | "done" | "failed";
export type AnalystStatus = "idle" | "generating" | "complete" | "failed";
export type ChatRole = "user" | "assistant";
export type SubscriptionPlan = "free" | "pro" | "max";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export type Project = {
  id: string;
  user_id: string;
  name: string;
  target_profile: string;
  idea_description: string;
  analyst_status: AnalystStatus;
  // NOT NULL DEFAULT 0 in DB (migration 015) — optional on insert.
  analyst_run_count?: number;
  created_at: string;
};

export type Interview = {
  id: string;
  project_id: string;
  persona_id: string | null;
  source: InterviewSource;
  meeting_platform: MeetingPlatform | null;
  meeting_link: string | null;
  attendee_name: string | null;
  attendee_company: string | null;
  scheduled_at: string | null;
  status: InterviewStatus;
  transcript: Array<{ speaker: string; text: string; timestamp: number }>;
  suggested_questions: string[];
  duration_seconds: number | null;
  recording_path: string | null;
  upload_status: UploadStatus;
  created_at: string;
};

export type Persona = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  job_titles: string[];
  pain_points: string[];
  status: PersonaStatus;
  created_at: string;
};

export type AnalystDocument = {
  id: string;
  project_id: string;
  content: Record<string, unknown>;
  pain_points: Array<{
    title: string;
    severity: "high" | "medium" | "low";
    count: number;
    example_quote?: string;
    example_source?: string;
  }>;
  patterns: Array<Record<string, unknown>>;
  key_quotes: Array<{
    quote: string;
    speaker: string;
    interview_id: string;
    tags: string[];
  }>;
  customer_language: string[];
  saturation_score: number;
  interview_count: number;
  unique_pattern_count: number;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  project_id: string;
  role: ChatRole;
  content: string;
  references: Array<Record<string, unknown>>;
  created_at: string;
};

export type UserSettings = {
  id: string;
  user_id: string;
  desktop_connected_at: string | null;
};

export type CalendarConnection = {
  id: string;
  user_id: string;
  provider: "google";
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_email: string | null;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at" | "analyst_status"> & {
          analyst_status?: AnalystStatus;
        };
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      interviews: {
        Row: Interview;
        Insert: Omit<
          Interview,
          | "id"
          | "created_at"
          | "upload_status"
          | "persona_id"
          | "duration_seconds"
          | "recording_path"
        > & {
          persona_id?: string | null;
          upload_status?: UploadStatus;
          duration_seconds?: number | null;
          recording_path?: string | null;
        };
        Update: Partial<Omit<Interview, "id">>;
        Relationships: [];
      };
      personas: {
        Row: Persona;
        Insert: Omit<Persona, "id" | "created_at" | "status"> & {
          status?: PersonaStatus;
        };
        Update: Partial<Omit<Persona, "id" | "created_at">>;
        Relationships: [];
      };
      analyst_documents: {
        Row: AnalystDocument;
        Insert: Omit<AnalystDocument, "id" | "updated_at">;
        Update: Partial<Omit<AnalystDocument, "id">>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, "id" | "created_at">;
        Update: Partial<Omit<ChatMessage, "id">>;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: Omit<UserSettings, "id">;
        Update: Partial<Omit<UserSettings, "id">>;
        Relationships: [];
      };
      calendar_connections: {
        Row: CalendarConnection;
        Insert: Omit<CalendarConnection, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<CalendarConnection, "id" | "created_at">>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, "id" | "created_at" | "updated_at"> & {
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          current_period_end?: string | null;
        };
        Update: Partial<Omit<Subscription, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
};
