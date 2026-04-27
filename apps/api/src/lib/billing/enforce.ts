import type { SupabaseClient } from "@supabase/supabase-js";

import { PLANS, withinLimit, type Plan } from "./plans";

export type LimitKey =
  | "project_create"
  | "interview_create"
  | "analyst_run";

export type LimitContext = {
  /** required for interview_create + analyst_run */
  projectId?: string;
};

type AllowedResult = { ok: true; plan: Plan };
type BlockedResult = { ok: false; response: Response };
type EnforceResult = AllowedResult | BlockedResult;

/**
 * Server-side gate for plan-tier limits. Loads the user's current plan
 * from `subscriptions`, counts current usage for the relevant resource,
 * and either allows the action or returns a 422 Response with a
 * structured PLAN_LIMIT body the client can render inline.
 *
 * Design choices:
 * - 422 (not 402) because the resource limit is a validation error on
 *   the request, not a payment-required state. (402 is reserved for the
 *   live-AI-copilot feature gate, which is binary on/off rather than a
 *   countable usage limit.)
 * - Body shape `{ error, code: "PLAN_LIMIT", stage, plan, limit, current }`
 *   mirrors the Stripe-error pattern from /api/stripe/checkout so the
 *   desktop's readErrorDetail helper handles both uniformly.
 * - Counts query the same supabase client passed in, which is the
 *   user-scoped client. RLS filters to the caller's rows automatically,
 *   so we don't need to plumb userId through.
 */
export async function assertWithinLimit(
  supabase: SupabaseClient,
  key: LimitKey,
  context: LimitContext = {},
): Promise<EnforceResult> {
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .maybeSingle();
  const plan = ((subscription as { plan?: string } | null)?.plan ?? "free") as Plan;
  const limits = PLANS[plan];

  let current: number;
  let limit: number;

  switch (key) {
    case "project_create": {
      const { count } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true });
      current = count ?? 0;
      limit = limits.projects;
      break;
    }
    case "interview_create": {
      if (!context.projectId) {
        return {
          ok: false,
          response: Response.json(
            { error: "Missing projectId for interview limit check." },
            { status: 500 },
          ),
        };
      }
      const { count } = await supabase
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .eq("project_id", context.projectId);
      current = count ?? 0;
      limit = limits.interviewsPerProject;
      break;
    }
    case "analyst_run": {
      if (!context.projectId) {
        return {
          ok: false,
          response: Response.json(
            { error: "Missing projectId for analyst-run limit check." },
            { status: 500 },
          ),
        };
      }
      const { data } = await supabase
        .from("projects")
        .select("analyst_run_count")
        .eq("id", context.projectId)
        .maybeSingle();
      current = (data as { analyst_run_count?: number } | null)?.analyst_run_count ?? 0;
      limit = limits.analystRuns;
      break;
    }
  }

  if (withinLimit(current, limit)) {
    return { ok: true, plan };
  }

  return {
    ok: false,
    response: Response.json(
      {
        error: messageFor(key, plan),
        code: "PLAN_LIMIT" as const,
        stage: key,
        plan,
        limit,
        current,
      },
      { status: 422 },
    ),
  };
}

function messageFor(key: LimitKey, plan: Plan): string {
  const planName = PLANS[plan].name;
  switch (key) {
    case "project_create":
      return `${planName} plan is limited to ${PLANS[plan].projects} project${PLANS[plan].projects === 1 ? "" : "s"}. Upgrade to create more.`;
    case "interview_create":
      return `${planName} plan is limited to ${PLANS[plan].interviewsPerProject} conversations per project. Upgrade to schedule more.`;
    case "analyst_run":
      return `${planName} plan is limited to ${PLANS[plan].analystRuns} analyst run${PLANS[plan].analystRuns === 1 ? "" : "s"} per project. Upgrade to run analysis again.`;
  }
}
