import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/billing/plans";
import type { Plan } from "@/lib/billing/plans";

const PLAN_ORDER: Plan[] = ["free", "pro", "max"];

export function PricingSection() {
  return (
    <section id="pricing" className="border-t border-border px-6 py-20">
      <h2
        className="text-center text-[28px] font-bold text-foreground"
        style={{ letterSpacing: "-0.02em" }}
      >
        Simple pricing
      </h2>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Start free. Upgrade when you need more.
      </p>

      <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((planKey) => {
          const plan = PLANS[planKey];
          return (
            <div
              key={planKey}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    ${plan.monthlyPriceUsd}
                  </span>
                  {plan.monthlyPriceUsd > 0 && (
                    <span className="text-xs text-muted-foreground">/month</span>
                  )}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-[12px] text-muted-foreground"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary font-bold">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href="/signup">
                <Button
                  variant={plan.highlighted ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                >
                  {plan.monthlyPriceUsd === 0 ? "Get started free" : `Start ${plan.name}`}
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
