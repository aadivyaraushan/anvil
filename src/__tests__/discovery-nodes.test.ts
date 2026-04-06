import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll add more tests as we build more nodes.
// This file tests node-level logic with mocked external deps.

describe("Apollo client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.APOLLO_API_KEY = "test";
  });

  it("returns contacts array from Apollo response", async () => {
    const { searchApollo } = await import("@/lib/apollo");

    const mockResponse = {
      people: [
        {
          first_name: "Sarah",
          last_name: "Chen",
          email: "sarah@finflow.com",
          title: "CFO",
          organization: { name: "FinFlow", website_url: "https://finflow.com" },
          linkedin_url: "https://linkedin.com/in/sarahchen",
          city: "San Francisco",
          state: "CA",
          country: "United States",
          employment_history: [{ organization_name: "FinFlow" }],
          label_names: [],
          departments: ["finance"],
          seniority: "c_suite",
        },
      ],
      pagination: { total_entries: 1 },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const contacts = await searchApollo({
      jobTitles: ["CFO", "VP Finance"],
      seniorityLevels: ["c_suite", "vp"],
      keywords: ["fintech"],
      perPage: 10,
    });

    expect(contacts).toHaveLength(1);
    expect(contacts[0].first_name).toBe("Sarah");
    expect(contacts[0].email).toBe("sarah@finflow.com");
    expect(contacts[0].company).toBe("FinFlow");
  });
});

describe("Tavily client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns answer string from Tavily response when answer is present", async () => {
    const { searchTavily } = await import("@/lib/tavily");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: "FinFlow is a fintech startup focused on SMB lending.",
        results: [],
      }),
    } as Response);

    process.env.TAVILY_API_KEY = "test";
    const result = await searchTavily("FinFlow company overview");
    expect(result).toBe("FinFlow is a fintech startup focused on SMB lending.");
  });

  it("falls back to result content when no answer", async () => {
    const { searchTavily } = await import("@/lib/tavily");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: null,
        results: [
          { content: "FinFlow raised Series A." },
          { content: "CEO is James Park." },
        ],
      }),
    } as Response);

    process.env.TAVILY_API_KEY = "test";
    const result = await searchTavily("FinFlow news");
    expect(result).toContain("FinFlow raised Series A.");
    expect(result).toContain("CEO is James Park.");
  });
});

vi.mock("resend", () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null });
  class MockResend {
    emails = { send: mockSend };
  }
  return { Resend: MockResend };
});

vi.mock("@/lib/apollo", () => ({
  searchApollo: vi.fn().mockResolvedValue([
    {
      first_name: "Sarah",
      last_name: "Chen",
      email: "sarah@finflow.com",
      title: "CFO",
      company: "FinFlow",
      company_website: "https://finflow.com",
      linkedin_url: "https://linkedin.com/in/sarahchen",
      industry: "fintech",
      location: "San Francisco, CA",
      raw: {},
    },
  ]),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: "contact-1", first_name: "Sarah", last_name: "Chen", email: "sarah@finflow.com", title: "CFO", company: "FinFlow", company_website: "https://finflow.com", linkedin_url: "", industry: "fintech", location: "San Francisco, CA", source: "apollo", project_id: "proj-1", research_brief: null, fit_score: null, fit_status: null, outreach_status: "pending", email_draft: null, email_sent_at: null, apollo_data: {} }],
          error: null,
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }),
}));

vi.mock("@/lib/llm", () => ({
  createLlm: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        jobTitles: ["CFO", "VP Finance"],
        seniorityLevels: ["c_suite", "vp"],
        keywords: ["fintech"],
      }),
    }),
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
  it("inserts contacts into DB and returns updated state", async () => {
    const { sourceContacts } = await import("@/lib/agents/discovery/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "CFOs at fintech companies",
      ideaDescription: "AI reconciliation tool",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [],
      currentIndex: 0,
      errors: [],
    };

    const result = await sourceContacts(state);

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts![0].first_name).toBe("Sarah");
  });
});

describe("routeNext routing logic", () => {
  it("returns nextIndex = 1 when currentIndex is 0 and contacts has 2 items", async () => {
    const { routeNext } = await import("@/lib/agents/discovery/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "CFOs",
      ideaDescription: "test",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [
        { id: "c1" } as any,
        { id: "c2" } as any,
      ],
      currentIndex: 0,
      errors: [],
    };

    const result = await routeNext(state);
    expect(result.currentIndex).toBe(1);
  });

  it("returns nextIndex = 2 when all contacts processed", async () => {
    const { routeNext } = await import("@/lib/agents/discovery/nodes");

    const state = {
      projectId: "proj-1",
      targetProfile: "CFOs",
      ideaDescription: "test",
      senderName: "Alice",
      senderEmail: "alice@example.com",
      autoSendEnabled: false,
      contacts: [{ id: "c1" } as any, { id: "c2" } as any],
      currentIndex: 1,
      errors: [],
    };

    const result = await routeNext(state);
    expect(result.currentIndex).toBe(2);
  });
});
