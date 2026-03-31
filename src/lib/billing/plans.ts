export type Plan = "free" | "pro" | "max";

export type PlanLimits = {
  projects: number;          // Infinity = unlimited
  contactsPerProject: number;
  interviewsPerProject: number;
  synthesisRuns: number;
  liveAICopilot: boolean;
};

export type PlanConfig = PlanLimits & {
  name: string;
  description: string;
  monthlyPriceUsd: number;
  stripePriceId: string | null; // null = free (no Stripe price)
  highlighted: boolean;
  features: string[];
};

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    name: "Free",
    description: "Try Anvil with your first idea.",
    monthlyPriceUsd: 0,
    stripePriceId: null,
    highlighted: false,
    projects: 1,
    contactsPerProject: 5,
    interviewsPerProject: 2,
    synthesisRuns: 1,
    liveAICopilot: false,
    features: [
      "1 project",
      "5 contacts per project",
      "2 interviews per project",
      "Prototype auto-build",
      "1 synthesis run",
    ],
  },
  pro: {
    name: "Pro",
    description: "For founders running active customer discovery.",
    monthlyPriceUsd: 29,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    highlighted: true,
    projects: 10,
    contactsPerProject: 100,
    interviewsPerProject: 20,
    synthesisRuns: Infinity,
    liveAICopilot: true,
    features: [
      "10 projects",
      "100 contacts per project",
      "20 interviews per project",
      "Live AI interview copilot",
      "Unlimited synthesis runs",
      "Prototype auto-build",
    ],
  },
  max: {
    name: "Max",
    description: "For teams and studios running multiple discovery tracks.",
    monthlyPriceUsd: 79,
    stripePriceId: process.env.STRIPE_MAX_PRICE_ID ?? null,
    highlighted: false,
    projects: Infinity,
    contactsPerProject: Infinity,
    interviewsPerProject: Infinity,
    synthesisRuns: Infinity,
    liveAICopilot: true,
    features: [
      "Unlimited projects",
      "Unlimited contacts",
      "Unlimited interviews",
      "Live AI interview copilot",
      "Unlimited synthesis runs",
      "Prototype auto-build",
      "Priority support",
    ],
  },
};

/** Returns true if the given count is within the plan limit. */
export function withinLimit(current: number, limit: number): boolean {
  return limit === Infinity || current < limit;
}
