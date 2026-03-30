export type PrototypeStatus = "pending" | "generating" | "deployed" | "failed";
export type DiscoveryStatus = "idle" | "running" | "partial" | "complete";
export type ContactSource = "apollo" | "csv";
export type FitStatus = "passed" | "skipped";
export type OutreachStatus =
  | "pending"
  | "drafted"
  | "approved"
  | "sent"
  | "replied";
export type MeetingPlatform = "zoom" | "google_meet";
export type InterviewStatus = "scheduled" | "live" | "completed";
export type ChatRole = "user" | "assistant";

export type Project = {
  id: string;
  user_id: string;
  name: string;
  target_profile: string;
  idea_description: string;
  prototype_url: string | null;
  prototype_repo_url: string | null;
  prototype_status: PrototypeStatus;
  prototype_phase: string | null;
  discovery_status: DiscoveryStatus;
  discovery_progress: number;
  created_at: string;
};

export type Contact = {
  id: string;
  project_id: string;
  source: ContactSource;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  linkedin_url: string;
  company_website: string;
  industry: string;
  location: string;
  research_brief: Record<string, unknown> | null;
  fit_score: number | null;
  fit_status: FitStatus | null;
  outreach_status: OutreachStatus;
  email_draft: string | null;
  email_sent_at: string | null;
  apollo_data: Record<string, unknown> | null;
};

export type Interview = {
  id: string;
  project_id: string;
  contact_id: string | null;
  meeting_platform: MeetingPlatform;
  meeting_link: string;
  scheduled_at: string;
  status: InterviewStatus;
  transcript: Array<{ speaker: string; text: string; timestamp: number }>;
  suggested_questions: string[];
  created_at: string;
};

export type SynthesisDocument = {
  id: string;
  project_id: string;
  content: Record<string, unknown>;
  pain_points: Array<Record<string, unknown>>;
  patterns: Array<Record<string, unknown>>;
  key_quotes: Array<{
    quote: string;
    contact_id: string;
    interview_id: string;
  }>;
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
  sender_email: string;
  sender_name: string;
  resend_api_key: string;
  apollo_api_key: string;
  auto_send_enabled: boolean;
  review_before_send: boolean;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at" | "prototype_url" | "prototype_repo_url" | "prototype_phase" | "discovery_status" | "discovery_progress"> & {
          prototype_url?: string | null;
          prototype_repo_url?: string | null;
          prototype_phase?: string | null;
          discovery_status?: DiscoveryStatus;
          discovery_progress?: number;
        };
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      contacts: {
        Row: Contact;
        Insert: Omit<Contact, "id">;
        Update: Partial<Omit<Contact, "id">>;
        Relationships: [];
      };
      interviews: {
        Row: Interview;
        Insert: Omit<Interview, "id" | "created_at">;
        Update: Partial<Omit<Interview, "id">>;
        Relationships: [];
      };
      synthesis_documents: {
        Row: SynthesisDocument;
        Insert: Omit<SynthesisDocument, "id" | "updated_at">;
        Update: Partial<Omit<SynthesisDocument, "id">>;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};
