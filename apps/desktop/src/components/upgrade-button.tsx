"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/billing/plans";

export function UpgradeButton({ plan }: { plan: Plan }) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" className="w-full" onClick={handleUpgrade} disabled={loading}>
      {loading ? "Loading..." : `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`}
    </Button>
  );
}
