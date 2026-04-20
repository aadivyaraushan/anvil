import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("resend", () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null });
  class MockResend {
    emails = { send: mockSend };
  }
  return { Resend: MockResend };
});

const personaRows = [
  {
    id: "persona-1",
    project_id: "proj-1",
    name: "Finance leader",
    description: "Owns reconciliation and reporting",
    job_titles: ["CFO"],
    pain_points: ["Manual close"],
    created_at: new Date().toISOString(),
  },
];

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn((table: string) => {
  if (table === "personas") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: personaRows, error: null }),
        }),
      }),
    };
  }

  return {
    update: vi.fn().mockReturnValue({
      eq: mockEq,
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}));

describe("Resend client", () => {
  it("calls Resend SDK and returns message ID", async () => {
    process.env.RESEND_API_KEY = "test";
    const { sendEmail } = await import("@/lib/resend");

    const id = await sendEmail({
      to: "sarah@finflow.com",
      from: "Team Anvil <you@yourdomain.com>",
      subject: "Quick question about SMB lending",
      text: "Hi Sarah, I noticed FinFlow recently...",
    });

    expect(id).toBe("msg_123");
  });
});

describe("sourceContacts node", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads personas and keeps imported contacts in state", async () => {
    const { sourceContacts } = await import("@/lib/agents/outreach/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "Finance leaders",
      ideaDescription: "AI close assistant",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [
        {
          id: "contact-1",
          project_id: "proj-1",
          persona_id: null,
          source: "csv" as const,
          first_name: "Sarah",
          last_name: "Chen",
          email: "sarah@finflow.com",
          title: "CFO",
          company: "FinFlow",
          linkedin_url: "",
          company_website: "",
          industry: "fintech",
          location: "San Francisco, CA",
          research_brief: null,
          fit_score: null,
          fit_status: null,
          outreach_status: "pending" as const,
          email_draft: null,
          email_sent_at: null,
          source_payload: {},
        },
      ],
      personas: [],
      currentIndex: 0,
      errors: [],
    };

    const result = await sourceContacts(state as never);

    expect(result.contacts).toHaveLength(1);
    expect(result.personas).toHaveLength(1);
    expect(result.personas?.[0].name).toBe("Finance leader");
  });
});

describe("routeNext routing logic", () => {
  it("returns nextIndex = 1 when currentIndex is 0 and contacts has 2 items", async () => {
    const { routeNext } = await import("@/lib/agents/outreach/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "CFOs",
      ideaDescription: "test",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [{ id: "c1" }, { id: "c2" }],
      personas: [],
      currentIndex: 0,
      errors: [],
    };

    const result = await routeNext(state as never);
    expect(result.currentIndex).toBe(1);
  });

  it("marks outreach complete when all contacts are processed", async () => {
    const { routeNext } = await import("@/lib/agents/outreach/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "CFOs",
      ideaDescription: "test",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [{ id: "c1" }],
      personas: [],
      currentIndex: 0,
      errors: [],
    };

    const result = await routeNext(state as never);

    expect(result.currentIndex).toBe(1);
    expect(mockEq).toHaveBeenCalled();
  });
});
