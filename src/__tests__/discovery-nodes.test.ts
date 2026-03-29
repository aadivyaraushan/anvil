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
