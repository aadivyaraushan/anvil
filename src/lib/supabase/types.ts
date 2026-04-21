export type MeetingPlatform = "zoom" | "google_meet";
export type InterviewStatus = "scheduled" | "live" | "completed";
export type InterviewBriefStatus = "idle" | "generating" | "complete" | "failed";
export type AnalystStatus = "idle" | "generating" | "complete" | "failed";
export type ChatRole = "user" | "assistant";

export type InterviewBrief = {
  name: string;
  role: string;
  company: string;
  industry: string;
  summary: string;
  background: string;
  relevance: string;
  suggested_topics: string[];
  online_sources: Array<{ title: string; url: string }>;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  target_profile: string;
  idea_description: string;
  analyst_status: AnalystStatus;
  archetypes_verified: boolean;
  created_at: string;
};

export type Contact = {
  id: string;
  project_id: string;
  persona_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  linkedin_url: string;
  company_website: string;
  industry: string;
  location: string;
};

export type Interview = {
  id: string;
  project_id: string;
  contact_id: string | null;
  persona_id: string | null;
  meeting_platform: MeetingPlatform;
  meeting_link: string;
  scheduled_at: string;
  status: InterviewStatus;
  transcript: Array<{ speaker: string; text: string; timestamp: number }>;
  suggested_questions: string[];
  brief: InterviewBrief | null;
  brief_status: InterviewBriefStatus;
  calendar_event_id: string | null;
  interviewee_name: string | null;
  interviewee_email: string | null;
  created_at: string;
};

export type AnalystDocument = {
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

export type Persona = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  job_titles: string[];
  pain_points: string[];
  created_at: string;
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
};

export type UserGoogleToken = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

export type SubscriptionPlan = "free" | "pro" | "max";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

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
      personas: {
        Row: Persona;
        Insert: Omit<Persona, "id" | "created_at">;
        Update: Partial<Omit<Persona, "id" | "created_at">>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at" | "analyst_status" | "archetypes_verified"> & {
          analyst_status?: AnalystStatus;
          archetypes_verified?: boolean;
        };
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      contacts: {
        Row: Contact;
        Insert: Omit<Contact, "id" | "persona_id"> & { persona_id?: string | null };
        Update: Partial<Omit<Contact, "id">>;
        Relationships: [];
      };
      interviews: {
        Row: Interview;
        Insert: Omit<Interview, "id" | "created_at" | "persona_id" | "brief" | "brief_status" | "calendar_event_id" | "interviewee_name" | "interviewee_email"> & {
          persona_id?: string | null;
          brief?: InterviewBrief | null;
          brief_status?: InterviewBriefStatus;
          calendar_event_id?: string | null;
          interviewee_name?: string | null;
          interviewee_email?: string | null;
        };
        Update: Partial<Omit<Interview, "id">>;
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
      user_google_tokens: {
        Row: UserGoogleToken;
        Insert: Omit<UserGoogleToken, "id">;
        Update: Partial<Omit<UserGoogleToken, "id">>;
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
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};
