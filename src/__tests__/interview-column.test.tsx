import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Interview } from "@/lib/supabase/types";

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
  scheduled_at: new Date(Date.now() + 86400_000).toISOString(), // tomorrow
  status: "scheduled",
  transcript: [],
  suggested_questions: [],
  created_at: new Date().toISOString(),
};

describe("InterviewColumn", () => {
  it("shows Schedule Interview button when no interviews", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(<InterviewColumn projectId="proj-1" initialInterviews={[]} />);
    expect(screen.getByText("Schedule Interview")).toBeDefined();
  });

  it("renders a scheduled interview", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(
      <InterviewColumn projectId="proj-1" initialInterviews={[baseInterview]} />
    );
    expect(screen.getByText(/scheduled/i)).toBeDefined();
  });

  it("shows live badge for active interview", async () => {
    const { InterviewColumn } = await import("@/components/interview-column");
    render(
      <InterviewColumn
        projectId="proj-1"
        initialInterviews={[{ ...baseInterview, status: "live" }]}
      />
    );
    expect(screen.getByText(/live/i)).toBeDefined();
  });
});
