import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Interview, Persona } from "@/lib/supabase/types";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

import React from "react";

const baseInterview: Interview = {
  id: "i1",
  project_id: "proj-1",
  contact_id: null,
  persona_id: null,
  meeting_platform: "zoom",
  meeting_link: "https://zoom.us/j/123",
  scheduled_at: new Date(Date.now() + 86400_000).toISOString(),
  status: "scheduled",
  transcript: [],
  suggested_questions: [],
  brief: null,
  brief_status: "idle",
  calendar_event_id: null,
  interviewee_name: null,
  interviewee_email: null,
  created_at: new Date().toISOString(),
};

const personas: Persona[] = [
  {
    id: "persona-1",
    project_id: "proj-1",
    name: "Finance leader",
    description: "Owns close and reporting",
    job_titles: ["CFO"],
    pain_points: ["Manual close"],
    created_at: new Date().toISOString(),
  },
];

describe("InterviewColumn", () => {
  it("shows Schedule Interview button when no interviews", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(
      <InterviewColumn
        projectId="proj-1"
        initialInterviews={[]}
        personas={personas}
      />
    );
    expect(screen.getByText("Schedule Interview")).toBeDefined();
  });

  it("renders a scheduled interview", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(
      <InterviewColumn
        projectId="proj-1"
        initialInterviews={[baseInterview]}
        personas={personas}
      />
    );
    expect(screen.getByText(/scheduled/i)).toBeDefined();
  });

  it("shows live badge for active interview", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(
      <InterviewColumn
        projectId="proj-1"
        initialInterviews={[{ ...baseInterview, status: "live", persona_id: "persona-1" }]}
        personas={personas}
      />
    );
    expect(screen.getByText(/live/i)).toBeDefined();
    expect(screen.getByText(/Finance leader/i)).toBeDefined();
  });
});
