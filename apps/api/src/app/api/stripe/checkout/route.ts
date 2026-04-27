import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";
import type { Plan } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = (await req.json()) as { plan: Plan };
  const planConfig = PLANS[plan];
  if (!planConfig.stripePriceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const stripe = getStripe();

  // Reuse existing customer if available
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  const customerId = sub?.stripe_customer_id ?? undefined;

  // Without NEXT_PUBLIC_APP_URL set, success_url/cancel_url become
  // "undefined/billing?..." and Stripe rejects with `url_invalid`. Fall
  // back to the request's origin so local dev works without extra env.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing`,
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Stripe SDK errors carry { type, code, message, param } — surface them
    // so the client can show a meaningful message instead of crashing on
    // an empty 500 body.
    const e = err as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
    };
    console.error("[stripe/checkout] session create failed:", e);
    return NextResponse.json(
      {
        error: "Stripe checkout failed",
        stage: "checkout_session_create",
        detail: e.message ?? null,
        code: e.code ?? null,
        param: e.param ?? null,
      },
      { status: 500 },
    );
  }
}
