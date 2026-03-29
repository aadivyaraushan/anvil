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
