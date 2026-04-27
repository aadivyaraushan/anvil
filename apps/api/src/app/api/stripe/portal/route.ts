import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { createUserSupabaseClient, extractBearerToken } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createUserSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const e = err as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
    };
    console.error("[stripe/portal] session create failed:", e);
    return NextResponse.json(
      {
        error: "Stripe portal failed",
        stage: "portal_session_create",
        detail: e.message ?? null,
        code: e.code ?? null,
      },
      { status: 500 },
    );
  }
}
