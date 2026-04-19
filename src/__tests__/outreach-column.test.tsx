import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Contact, Project } from "@/lib/supabase/types";

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

const baseProject: Project = {
  id: "proj-1",
  user_id: "user-1",
  name: "Test Project",
  target_profile: "CFOs",
  idea_description: "test",
  outreach_status: "idle",
  outreach_progress: 0,
  analyst_status: "idle",
  archetypes_verified: false,
  created_at: new Date().toISOString(),
};

describe("OutreachColumn", () => {
  it("shows Run Outreach button when idle", async () => {
    const { OutreachColumn } = await import("@/components/outreach-column");
    render(<OutreachColumn project={baseProject} initialContacts={[]} />);
    expect(screen.getByText("Run Outreach")).toBeDefined();
  });

  it("shows running state with progress", async () => {
    const { OutreachColumn } = await import("@/components/outreach-column");
    render(
      <OutreachColumn
        project={{ ...baseProject, outreach_status: "running", outreach_progress: 5 }}
        initialContacts={[]}
      />
    );
    expect(screen.getByText(/Processing/)).toBeDefined();
    expect(screen.getByText(/5/)).toBeDefined();
  });

  it("shows Continue Outreach button when partial", async () => {
    const { OutreachColumn } = await import("@/components/outreach-column");
    render(
      <OutreachColumn
        project={{ ...baseProject, outreach_status: "partial", outreach_progress: 10 }}
        initialContacts={[]}
      />
    );
    expect(screen.getByText("Continue Outreach")).toBeDefined();
  });

  it("shows contact cards with fit badges", async () => {
    const { OutreachColumn } = await import("@/components/outreach-column");
    const contacts: Contact[] = [
      {
        id: "c1",
        project_id: "proj-1",
        persona_id: null,
        source: "apollo",
        first_name: "Sarah",
        last_name: "Chen",
        email: "sarah@finflow.com",
        title: "CFO",
        company: "FinFlow",
        linkedin_url: "",
        company_website: "",
        industry: "fintech",
        location: "San Francisco",
        research_brief: null,
        fit_score: 85,
        fit_status: "passed",
        outreach_status: "sent",
        email_draft: "Hi Sarah...",
        email_sent_at: null,
        apollo_data: null,
      },
    ];
    render(
      <OutreachColumn
        project={{ ...baseProject, outreach_status: "complete", outreach_progress: 1 }}
        initialContacts={contacts}
      />
    );
    expect(screen.getByText("Sarah Chen")).toBeDefined();
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/Sent/i)).toBeDefined();
  });
});
