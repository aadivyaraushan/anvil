import { describe, expect, it } from "vitest";

import { assertWithinLimit } from "@/lib/billing/enforce";

/**
 * Unit tests for the server-side plan-limit gate. Mocks the supabase
 * client surface used by enforce.ts:
 *   .from(table).select(cols, opts).maybeSingle() / .eq().maybeSingle()
 *   .from(table).select(cols, { count: "exact", head: true }).eq()
 */

type Stub = Record<string, () => Stub | Promise<unknown>>;

function makeStub(handlers: Record<string, () => Promise<unknown>>) {
  const stub: Stub = {};
  let path: string[] = [];

  const wrap = (key: string) => {
    path.push(key);
    const lookup = path.join(".");
    const handler = handlers[lookup];
    if (handler) {
      path = [];
      return handler();
    }
    return chain;
  };

  const chain: Stub = {
    select: () => wrap("select"),
    eq: () => wrap("eq"),
    maybeSingle: () => wrap("maybeSingle") as never,
  };

  return {
    from: (table: string) => {
      path = [table];
      return {
        select: (_cols?: string, _opts?: unknown) => {
          path.push("select");
          const lookup = path.join(".");
          const handler = handlers[lookup];
          if (handler) {
            path = [];
            return handler();
          }
          return chain;
        },
      };
    },
  } as unknown;
}

describe("assertWithinLimit — project_create", () => {
  it("allows when free user has 0 projects", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return {
            select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }),
          };
        }
        if (table === "projects") {
          return {
            select: (_cols: string, opts: { count?: string; head?: boolean }) => {
              expect(opts.count).toBe("exact");
              expect(opts.head).toBe(true);
              return Promise.resolve({ count: 0 });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "project_create");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan).toBe("free");
  });

  it("blocks at 1 project for free with 422 + PLAN_LIMIT", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }) };
        }
        if (table === "projects") {
          return { select: () => Promise.resolve({ count: 1 }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "project_create");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      const body = await result.response.json();
      expect(body.code).toBe("PLAN_LIMIT");
      expect(body.stage).toBe("project_create");
      expect(body.plan).toBe("free");
      expect(body.limit).toBe(1);
      expect(body.current).toBe(1);
    }
  });

  it("allows pro user past free limit", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: { plan: "pro" } }) }) };
        }
        if (table === "projects") {
          return { select: () => Promise.resolve({ count: 5 }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "project_create");
    expect(result.ok).toBe(true);
  });

  it("treats no subscription row as free plan", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: null }) }) };
        }
        if (table === "projects") {
          return { select: () => Promise.resolve({ count: 1 }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "project_create");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
  });
});

describe("assertWithinLimit — interview_create", () => {
  it("blocks at 2 interviews for free per project", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }) };
        }
        if (table === "interviews") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 2 }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "interview_create", {
      projectId: "p-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(body.stage).toBe("interview_create");
      expect(body.limit).toBe(2);
    }
  });

  it("returns 500 if projectId missing", async () => {
    const supabase = {
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }) }),
    };
    const result = await assertWithinLimit(supabase as never, "interview_create");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });
});

describe("assertWithinLimit — analyst_run", () => {
  it("blocks at 1 analyst run for free per project", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }) };
        }
        if (table === "projects") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { analyst_run_count: 1 } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "analyst_run", {
      projectId: "p-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(body.stage).toBe("analyst_run");
      expect(body.current).toBe(1);
    }
  });

  it("allows when analyst_run_count is 0", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "subscriptions") {
          return { select: () => ({ maybeSingle: async () => ({ data: { plan: "free" } }) }) };
        }
        if (table === "projects") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { analyst_run_count: 0 } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertWithinLimit(supabase as never, "analyst_run", {
      projectId: "p-1",
    });
    expect(result.ok).toBe(true);
  });
});
