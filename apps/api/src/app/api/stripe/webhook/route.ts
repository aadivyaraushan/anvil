import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/billing/plans";
import type Stripe from "stripe";

function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_MAX_PRICE_ID) return "max";
  return "free";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return NextResponse.json({ received: true });

    const userId = session.metadata?.user_id;
    if (!userId) return NextResponse.json({ received: true });
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    // Fetch subscription to get price
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    const priceId = item?.price.id ?? "";
    const plan = planFromPriceId(priceId);
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null;

    await supabase
      .from("subscriptions")
      .upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        plan,
        status: "active",
        current_period_end: periodEnd,
      }, { onConflict: "user_id" });
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const item = subscription.items.data[0];
    const priceId = item?.price.id ?? "";
    const plan = planFromPriceId(priceId);
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null;
    const status = subscription.status as "active" | "trialing" | "past_due" | "canceled" | "incomplete";

    await supabase
      .from("subscriptions")
      .update({
        plan,
        status,
        stripe_price_id: priceId,
        current_period_end: periodEnd,
      })
      .eq("stripe_subscription_id", subscription.id);
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await supabase
      .from("subscriptions")
      .update({ plan: "free", status: "canceled", stripe_subscription_id: null })
      .eq("stripe_subscription_id", subscription.id);
  }

  return NextResponse.json({ received: true });
}
