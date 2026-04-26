export type Plan = "free" | "pro" | "max";

export type PlanLimits = {
  projects: number;          // Infinity = unlimited
  contactsPerProject: number;
  interviewsPerProject: number;
  analystRuns: number;
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
    analystRuns: 1,
    liveAICopilot: false,
    features: [
      "1 project",
      "5 contacts per project",
      "2 conversations per project",
      "1 analyst run",
    ],
  },
  pro: {
    name: "Pro",
    description: "For founders running active customer intelligence loops.",
    monthlyPriceUsd: 29,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    highlighted: true,
    projects: 10,
    contactsPerProject: 100,
    interviewsPerProject: 20,
    analystRuns: Infinity,
    liveAICopilot: true,
    features: [
      "10 projects",
      "100 contacts per project",
      "20 conversations per project",
      "Live AI conversation copilot",
      "Unlimited analyst runs",
    ],
  },
  max: {
    name: "Max",
    description: "For teams and studios running multiple research tracks.",
    monthlyPriceUsd: 79,
    stripePriceId: process.env.STRIPE_MAX_PRICE_ID ?? null,
    highlighted: false,
    projects: Infinity,
    contactsPerProject: Infinity,
    interviewsPerProject: Infinity,
    analystRuns: Infinity,
    liveAICopilot: true,
    features: [
      "Unlimited projects",
      "Unlimited contacts",
      "Unlimited conversations",
      "Live AI conversation copilot",
      "Unlimited analyst runs",
      "Priority support",
    ],
  },
};

/** Returns true if the given count is within the plan limit. */
export function withinLimit(current: number, limit: number): boolean {
  return limit === Infinity || current < limit;
}
