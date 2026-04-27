import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  cleanupProjectsForUser,
  getSubscription,
  getUserIdByEmail,
  upsertSubscription,
} from "./helpers/db";

/**
 * Audit-pass coverage for billing flows.
 *
 *   F1   POST /api/stripe/checkout — verify returns { url } pointing
 *        at a real Stripe checkout session URL. Locks in the
 *        APP_URL-fallback fix and the structured-error path from the
 *        prior audit pass.
 *
 *   F2a  POST /api/stripe/portal with no Stripe customer — 404.
 *
 *   F2b  POST /api/stripe/portal with a phony customer id — 500 with
 *        structured `{ stage: 'portal_session_create', detail }` body
 *        (regression lock for the empty-500 bug fixed earlier).
 *
 *   F3   Stripe webhook signature simulation — POST a synthesized,
 *        signed customer.subscription.updated event and verify the
 *        subscriptions row's plan flips. Uses the local
 *        STRIPE_WEBHOOK_SECRET so we don't need `stripe listen`.
 */

let testUserId: string;
let userToken: string;

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

test.beforeAll(async () => {
  const id = await getUserIdByEmail(process.env.E2E_TEST_EMAIL!);
  if (!id) throw new Error("E2E test user not found");
  testUserId = id;
  await upsertSubscription({ userId: id, plan: "free" });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.E2E_TEST_EMAIL!,
    password: process.env.E2E_TEST_PASSWORD!,
  });
  if (error || !data.session) {
    throw new Error(`audit-billing: could not sign in: ${error?.message}`);
  }
  userToken = data.session.access_token;
});

test.afterEach(async () => {
  await cleanupProjectsForUser(testUserId);
  // Reset subscription back to free for next test.
  await upsertSubscription({ userId: testUserId, plan: "free" });
});

test.describe("audit: billing", () => {
  test("F1 POST /stripe/checkout returns a real Stripe checkout url for plan='pro'", async ({
    request,
  }) => {
    const res = await request.post(`${apiBase}/api/stripe/checkout`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      data: { plan: "pro" },
    });
    expect(res.status(), `body: ${await res.text().catch(() => "")}`).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  test("F2a POST /stripe/portal returns 404 when the user has no Stripe customer", async ({
    request,
  }) => {
    // beforeEach reset us to free with no stripe_customer_id.
    const res = await request.post(`${apiBase}/api/stripe/portal`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status()).toBe(404);
  });

  test("F2b POST /stripe/portal with a bogus customer id returns 500 with structured error (regression lock)", async ({
    request,
  }) => {
    // Seed a stripe_customer_id that Stripe will reject when the route
    // calls billingPortal.sessions.create. With the structured-error fix
    // in place the route surfaces { stage, detail } instead of a bare 500.
    await upsertSubscription({
      userId: testUserId,
      plan: "free",
      stripeCustomerId: "cus_invalidaudit12345",
    });

    const res = await request.post(`${apiBase}/api/stripe/portal`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status()).toBe(500);
    const body = (await res.json()) as {
      error?: string;
      stage?: string;
      detail?: string;
    };
    expect(body.stage).toBe("portal_session_create");
    expect(body.detail).toBeTruthy();
  });

  test("F3 webhook customer.subscription.updated → flips subscriptions.plan to 'pro'", async ({
    request,
  }) => {
    // Seed a row with a known stripe_subscription_id so the event's WHERE
    // clause matches. The webhook route updates by stripe_subscription_id.
    const fakeSubId = `sub_audit_${Date.now()}`;
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    await sb
      .from("subscriptions")
      .update({
        stripe_subscription_id: fakeSubId,
        stripe_customer_id: "cus_audit",
        plan: "free",
      })
      .eq("user_id", testUserId);

    // Build a payload that matches the route's expectations: a
    // customer.subscription.updated event whose first item's price.id
    // matches STRIPE_PRO_PRICE_ID. Sign with the local webhook secret.
    const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
    test.skip(!proPriceId, "STRIPE_PRO_PRICE_ID not set in env");
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

    const event = {
      id: `evt_audit_${Date.now()}`,
      object: "event",
      api_version: "2024-11-20.acacia",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: fakeSubId,
          object: "subscription",
          status: "active",
          customer: "cus_audit",
          items: {
            object: "list",
            data: [
              {
                id: "si_audit",
                object: "subscription_item",
                price: { id: proPriceId, object: "price" },
                current_period_end: periodEnd,
              },
            ],
          },
        },
      },
    };

    const payload = JSON.stringify(event);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy", {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const res = await request.post(`${apiBase}/api/stripe/webhook`, {
      headers: {
        "stripe-signature": signature,
        "Content-Type": "application/json",
      },
      data: payload,
    });
    expect(res.status(), `body: ${await res.text().catch(() => "")}`).toBe(200);

    // Subscription row's plan should now be 'pro'.
    const sub = await getSubscription(testUserId);
    expect(sub?.plan).toBe("pro");
  });
});
