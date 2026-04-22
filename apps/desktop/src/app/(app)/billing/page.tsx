"use client";

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/use-auth";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { mapError } from "@/lib/errors";
import { ErrorCard } from "@/components/error-card";
import { PLANS } from "@/lib/billing/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import type { SubscriptionPlan } from "@/lib/supabase/types";

export default function BillingPage() {
  const user = useUser();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const limit = searchParams.get("limit");

  const { data: subscription, error, isLoading } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const plan: SubscriptionPlan = subscription?.plan ?? "free";
  const planConfig = PLANS[plan];

  const handleUpgrade = async (targetPlan: SubscriptionPlan) => {
    const session = await getSupabase().auth.getSession();
    const token = session.data.session?.access_token;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/stripe/checkout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: targetPlan }),
      }
    );
    const { url } = await res.json();
    if (url) window.open(url, "_blank");
  };

  const handleManageBilling = async () => {
    const session = await getSupabase().auth.getSession();
    const token = session.data.session?.access_token;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/stripe/portal`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const { url } = await res.json();
    if (url) window.open(url, "_blank");
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorCard error={mapError(error)} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and usage.
        </p>
      </div>

      {success === "true" && (
        <div className="rounded-lg border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
          Your subscription is now active.
        </div>
      )}
      {limit === "projects" && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
          You&apos;ve reached your project limit on the {planConfig.name} plan.
          Upgrade to create more.
        </div>
      )}

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
            {planConfig.features.map((f: string) => (
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
                month: "long", day: "numeric", year: "numeric",
              })}
            </p>
          )}
          {plan !== "free" && subscription?.stripe_customer_id && (
            <Button variant="outline" size="sm" onClick={handleManageBilling}>
              Manage billing
            </Button>
          )}
        </CardContent>
      </Card>

      {plan !== "max" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade</CardTitle>
            <CardDescription>
              Unlock more projects, interviews, and AI analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(["pro", "max"] as const)
              .filter((p) => p !== plan)
              .map((targetPlan) => {
                const config = PLANS[targetPlan];
                return (
                  <div key={targetPlan} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold">${config.monthlyPriceUsd}</span>
                      <span className="text-xs text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm font-medium">{config.name}</p>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                    <Button size="sm" onClick={() => handleUpgrade(targetPlan)}>
                      Upgrade to {config.name}
                    </Button>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
