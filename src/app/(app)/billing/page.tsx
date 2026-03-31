import { getUserPlan, getUserSubscription } from "@/lib/billing/subscription";
import { PLANS } from "@/lib/billing/plans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradeButton } from "@/components/upgrade-button";
import { ManageBillingButton } from "@/components/manage-billing-button";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const plan = await getUserPlan();
  const subscription = await getUserSubscription();
  const planConfig = PLANS[plan];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and usage limits.
        </p>
      </div>

      {params.success === "true" && (
        <div className="mb-6 rounded-lg border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
          Your subscription is now active.
        </div>
      )}

      {params.limit === "projects" && (
        <div className="mb-6 rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
          You&apos;ve reached your project limit on the {planConfig.name} plan. Upgrade to create more projects.
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* Current plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current plan</CardTitle>
              <Badge variant="outline">{planConfig.name}</Badge>
            </div>
            <CardDescription>{planConfig.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1">
              {planConfig.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-primary">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {subscription?.current_period_end && plan !== "free" && (
              <p className="text-xs text-muted-foreground">
                Renews{" "}
                {new Date(subscription.current_period_end).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
            {plan !== "free" && subscription?.stripe_customer_id && (
              <ManageBillingButton />
            )}
          </CardContent>
        </Card>

        {/* Upgrade options */}
        {plan !== "max" && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade</CardTitle>
              <CardDescription>
                Unlock more projects, interviews, and AI features.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {(["pro", "max"] as const)
                .filter((p) => p !== plan)
                .map((targetPlan) => {
                  const config = PLANS[targetPlan];
                  return (
                    <div
                      key={targetPlan}
                      className="rounded-lg border border-border p-4 space-y-3"
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold">${config.monthlyPriceUsd}</span>
                        <span className="text-xs text-muted-foreground">/month</span>
                      </div>
                      <p className="text-sm font-medium">{config.name}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                      <UpgradeButton plan={targetPlan} />
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
