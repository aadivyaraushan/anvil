import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Contact, Project } from "@/lib/supabase/types";

// Mock Supabase client (used for Realtime subscriptions)
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  }),
}));

// Mock UI components to avoid @base-ui/react rendering issues in jsdom
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
  prototype_url: null,
  prototype_repo_url: null,
  prototype_status: "deployed",
  discovery_status: "idle",
  discovery_progress: 0,
  created_at: new Date().toISOString(),
};

describe("DiscoveryColumn", () => {
  it("shows Run Discovery button when idle", async () => {
    const { DiscoveryColumn } = await import("@/components/discovery-column");
    render(<DiscoveryColumn project={baseProject} initialContacts={[]} />);
    expect(screen.getByText("Run Discovery")).toBeDefined();
  });

  it("shows running state with progress", async () => {
    const { DiscoveryColumn } = await import("@/components/discovery-column");
    render(
      <DiscoveryColumn
        project={{ ...baseProject, discovery_status: "running", discovery_progress: 5 }}
        initialContacts={[]}
      />
    );
    expect(screen.getByText(/Processing/)).toBeDefined();
    expect(screen.getByText(/5/)).toBeDefined();
  });

  it("shows Continue Discovery button when partial", async () => {
    const { DiscoveryColumn } = await import("@/components/discovery-column");
    render(
      <DiscoveryColumn
        project={{ ...baseProject, discovery_status: "partial", discovery_progress: 10 }}
        initialContacts={[]}
      />
    );
    expect(screen.getByText("Continue Discovery")).toBeDefined();
  });

  it("shows contact cards with fit badges", async () => {
    const { DiscoveryColumn } = await import("@/components/discovery-column");
    const contacts: Contact[] = [
      {
        id: "c1",
        project_id: "proj-1",
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
      <DiscoveryColumn
        project={{ ...baseProject, discovery_status: "complete", discovery_progress: 1 }}
        initialContacts={contacts}
      />
    );
    expect(screen.getByText("Sarah Chen")).toBeDefined();
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/Sent/i)).toBeDefined();
  });
});
