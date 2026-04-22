import Link from "next/link";
import { Check, ArrowRight, Mic } from "lucide-react";

// Pricing data (synced manually with apps/api billing/plans.ts)
const PLANS = [
  {
    name: "Free",
    description: "Try Anvil with your first project.",
    price: 0,
    highlighted: false,
    features: [
      "1 project",
      "2 interviews per project",
      "1 analyst run",
      "Transcript + basic findings",
    ],
    cta: "Download free",
    ctaHref: "https://releases.anvil.app/Anvil-latest.dmg",
  },
  {
    name: "Pro",
    description: "For founders running active research loops.",
    price: 29,
    highlighted: true,
    features: [
      "10 projects",
      "20 interviews per project",
      "Live AI interview copilot",
      "Unlimited analyst runs",
      "Calendar sync",
    ],
    cta: "Start Pro — $29/mo",
    ctaHref: "https://releases.anvil.app/Anvil-latest.dmg",
  },
  {
    name: "Max",
    description: "For teams running multiple research tracks.",
    price: 79,
    highlighted: false,
    features: [
      "Unlimited projects",
      "Unlimited interviews",
      "Live AI interview copilot",
      "Unlimited analyst runs",
      "Priority support",
    ],
    cta: "Start Max — $79/mo",
    ctaHref: "https://releases.anvil.app/Anvil-latest.dmg",
  },
];

const SOCIAL_PROOF = [
  "Ramp alumni",
  "Stripe alumni",
  "Figma alumni",
  "a16z portfolio",
  "YC W25",
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture any conversation",
    body: "Press ⌥⌘R from anywhere on your Mac. Anvil records mic and system audio — scheduled calls, in-person, hallway chats. Works offline; uploads when you reconnect.",
  },
  {
    step: "02",
    title: "Transcript appears in seconds",
    body: "Deepgram transcribes in real-time as you talk. Speaker turns are labelled. Monospace timestamps in the gutter for quick navigation.",
  },
  {
    step: "03",
    title: "Findings surface automatically",
    body: "After each interview the analyst extracts pain-point patterns, customer language, and severity signals. After two interviews it proposes archetypes — edit or confirm inline.",
  },
];

// Static waveform heights for the capsule mock
const WAVE_HEIGHTS = Array.from({ length: 36 }, (_, i) =>
  3 + Math.abs(Math.sin(i * 0.8)) * 14
);

export default function MarketingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <header className="flex items-center px-12 py-6 border-b border-white/[0.07]">
        <span className="text-[17px] font-semibold tracking-[-0.02em]">
          Anvil
        </span>
        <nav className="ml-12 flex gap-7 text-[13.5px] text-[oklch(0.50_0.01_264)]">
          <a href="#how-it-works" className="hover:text-[oklch(0.72_0.01_264)] transition-colors">
            How it works
          </a>
          <a href="#for-founders" className="hover:text-[oklch(0.72_0.01_264)] transition-colors">
            For founders
          </a>
          <a href="#pricing" className="hover:text-[oklch(0.72_0.01_264)] transition-colors">
            Pricing
          </a>
        </nav>
        <span className="flex-1" />
        <a
          href="https://app.anvil.app/login"
          className="text-[13px] text-[oklch(0.72_0.01_264)] hover:text-[oklch(0.96_0.005_264)] transition-colors mr-4"
        >
          Sign in
        </a>
        <a
          href="https://releases.anvil.app/Anvil-latest.dmg"
          className="h-8 px-4 rounded-md bg-[oklch(0.55_0.18_264)] hover:bg-[oklch(0.60_0.18_264)] text-white text-[13px] font-medium transition-colors inline-flex items-center"
        >
          Download for Mac
        </a>
      </header>

      {/* ── Hero ── */}
      <section className="flex-1 px-12 pt-[52px] pb-0 grid grid-cols-2 gap-12 items-center max-w-[1280px] mx-auto w-full">
        {/* Left copy */}
        <div>
          <p className="anvil-caps mb-[18px]">Customer research for founders</p>
          <h1
            className="text-[64px] font-semibold tracking-[-0.035em] leading-[0.98] m-0"
          >
            Record the<br />
            conversation.<br />
            <span className="anvil-serif text-[oklch(0.72_0.01_264)] font-normal">
              Anvil does
            </span>{" "}
            the rest.
          </h1>
          <p className="mt-6 text-[17px] leading-[1.5] text-[oklch(0.72_0.01_264)] max-w-[460px]">
            A native Mac app that captures your customer conversations —
            scheduled calls, hallway chats, phone, in-person — and turns them
            into findings you can act on.
          </p>
          <div className="mt-8 flex gap-3 items-center">
            <a
              href="https://releases.anvil.app/Anvil-latest.dmg"
              className="h-10 px-5 rounded-md bg-[oklch(0.55_0.18_264)] hover:bg-[oklch(0.60_0.18_264)] text-white text-[14px] font-medium transition-colors inline-flex items-center gap-2"
            >
              Download for Mac
              <ArrowRight size={14} />
            </a>
            <button className="h-10 px-5 rounded-md text-[14px] text-[oklch(0.72_0.01_264)] hover:text-[oklch(0.96_0.005_264)] transition-colors">
              Watch a 90-sec tour
            </button>
          </div>
          <div className="mt-[22px] flex gap-[18px] text-[12px] text-[oklch(0.50_0.01_264)]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[oklch(0.707_0.165_254)]" />
              Works offline
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[oklch(0.707_0.165_254)]" />
              Captures in-person too
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-[oklch(0.707_0.165_254)]" />
              SOC 2
            </span>
          </div>
        </div>

        {/* Right — desktop app mock */}
        <div className="relative h-[460px]">
          <div
            className="absolute inset-0 rounded-[14px] overflow-hidden"
            style={{
              background: "linear-gradient(135deg, oklch(0.32 0.08 264), oklch(0.22 0.05 280))",
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            {/* Menu bar */}
            <div
              className="h-7 flex items-center px-3 gap-3.5 text-white text-[12px]"
              style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(20px)" }}
            >
              <span className="font-semibold"></span>
              <span className="font-semibold">Anvil</span>
              <span className="opacity-70">File</span>
              <span className="opacity-70">Edit</span>
              <span className="flex-1" />
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.66 0.22 18)" }}
                />
                14:22
              </span>
              <span className="opacity-60">Tue 2:14</span>
            </div>

            {/* Floating capsule */}
            <div
              className="absolute left-8 bottom-[110px] w-[300px] rounded-[14px] p-4 flex flex-col gap-3"
              style={{
                background: "oklch(0.11 0.008 264)",
                border: "1px solid rgba(255,255,255,0.13)",
                boxShadow: "0 12px 36px rgba(0,0,0,.4)",
                color: "oklch(0.96 0.005 264)",
              }}
            >
              <div className="flex items-center gap-2.5">
                {/* Live dot */}
                <span className="relative flex size-2 shrink-0">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                    style={{ background: "oklch(0.66 0.22 18)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full size-2"
                    style={{ background: "oklch(0.66 0.22 18)" }}
                  />
                </span>
                <div className="flex-1">
                  <div className="text-[13px] font-medium tracking-tight">Recording</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.50 0.01 264)" }}>
                    Finops research · Sarah Chen
                  </div>
                </div>
                <span className="anvil-mono text-[12px]">14:22</span>
              </div>
              {/* Waveform bars */}
              <div className="flex items-center gap-px h-[18px]">
                {WAVE_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px]"
                    style={{
                      height: `${h}px`,
                      background:
                        i > 30
                          ? "oklch(0.66 0.22 18)"
                          : "oklch(0.50 0.01 264)",
                      opacity: 0.5 + i / 50,
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  className="flex-1 h-7 rounded-md text-[12px] border"
                  style={{
                    borderColor: "rgba(255,255,255,0.13)",
                    color: "oklch(0.72 0.01 264)",
                    background: "transparent",
                  }}
                >
                  Pause
                </button>
                <button
                  className="flex-[2] h-7 rounded-md text-[12px] font-medium text-white"
                  style={{ background: "oklch(0.55 0.18 264)" }}
                >
                  Stop & review
                </button>
              </div>
            </div>

            {/* Floating quote chip */}
            <div
              className="absolute right-6 top-[72px] w-[280px] rounded-[10px] p-3"
              style={{
                background: "oklch(0.155 0.01 264)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 10px 30px rgba(0,0,0,.35)",
                color: "oklch(0.96 0.005 264)",
              }}
            >
              <p className="anvil-caps mb-1.5">Pattern emerging</p>
              <blockquote className="anvil-serif m-0 text-[14px] leading-[1.45]">
                <span style={{ color: "oklch(0.77 0.14 75)" }}>"</span>
                Close takes a full week just because nothing reconciles.
                <span style={{ color: "oklch(0.77 0.14 75)" }}>"</span>
              </blockquote>
              <div className="mt-2.5">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{
                    background: "oklch(0.77 0.14 75 / 0.15)",
                    color: "oklch(0.77 0.14 75)",
                  }}
                >
                  Manual reconciliation
                </span>
              </div>
            </div>

            {/* Context callout */}
            <div
              className="absolute right-10 bottom-10 px-3 py-2 rounded-lg text-white text-[11px] inline-flex items-center gap-2"
              style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(20px)" }}
            >
              <Mic size={12} />
              Capturing mic + system audio
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <div
        className="px-12 py-[22px] flex gap-8 text-[12px] mt-[44px]"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <span className="text-[oklch(0.38_0.008_264)]">Trusted by founders at</span>
        {SOCIAL_PROOF.map((x) => (
          <span key={x} className="text-[oklch(0.50_0.01_264)]">
            {x}
          </span>
        ))}
      </div>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="px-12 py-20 border-t border-white/[0.07]"
      >
        <div className="max-w-[1280px] mx-auto">
          <p className="anvil-caps mb-4">How it works</p>
          <h2 className="text-[36px] font-semibold tracking-[-0.03em] leading-tight mb-14">
            From conversation to clarity
            <br />
            <span className="anvil-serif text-[oklch(0.72_0.01_264)] font-normal">
              in three steps.
            </span>
          </h2>
          <div className="grid grid-cols-3 gap-10">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <div key={step}>
                <div className="anvil-mono text-[11px] text-[oklch(0.50_0.01_264)] mb-3">
                  {step}
                </div>
                <h3 className="text-[18px] font-semibold tracking-[-0.02em] mb-3">
                  {title}
                </h3>
                <p className="text-[14px] leading-relaxed text-[oklch(0.72_0.01_264)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For founders ── */}
      <section
        id="for-founders"
        className="px-12 py-20 border-t border-white/[0.07]"
        style={{ background: "oklch(0.155 0.01 264)" }}
      >
        <div className="max-w-[900px] mx-auto text-center">
          <p className="anvil-caps mb-4">For founders</p>
          <blockquote
            className="anvil-serif text-[32px] leading-[1.3]"
            style={{ color: "oklch(0.96 0.005 264)" }}
          >
            <span style={{ color: "oklch(0.77 0.14 75)" }}>"</span>
            The best founders I know talk to customers obsessively — then
            forget half of it. Anvil is the memory they never had.
            <span style={{ color: "oklch(0.77 0.14 75)" }}>"</span>
          </blockquote>
          <p className="mt-5 text-[13.5px] text-[oklch(0.50_0.01_264)]">
            — early user, YC W25
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        id="pricing"
        className="px-12 py-20 border-t border-white/[0.07]"
      >
        <div className="max-w-[1280px] mx-auto">
          <p className="anvil-caps mb-4">Pricing</p>
          <h2 className="text-[36px] font-semibold tracking-[-0.03em] leading-tight mb-14">
            Simple, transparent pricing.
          </h2>
          <div className="grid grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6 flex flex-col gap-5"
                style={{
                  background: plan.highlighted
                    ? "oklch(0.185 0.012 264)"
                    : "oklch(0.155 0.01 264)",
                  boxShadow: plan.highlighted
                    ? "inset 0 0 0 1px rgba(255,255,255,0.15)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.07)",
                }}
              >
                <div>
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">
                    {plan.name}
                  </div>
                  <div className="text-[13px] text-[oklch(0.72_0.01_264)] mt-1">
                    {plan.description}
                  </div>
                </div>
                <div>
                  <span className="text-[36px] font-semibold tracking-[-0.03em]">
                    ${plan.price}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-[14px] text-[oklch(0.50_0.01_264)] ml-1">
                      / mo
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[13px] text-[oklch(0.72_0.01_264)]"
                    >
                      <Check
                        size={13}
                        className="mt-[1px] shrink-0"
                        style={{ color: "oklch(0.707 0.165 254)" }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.ctaHref}
                  className="h-9 rounded-md text-[13.5px] font-medium transition-colors inline-flex items-center justify-center"
                  style={
                    plan.highlighted
                      ? {
                          background: "oklch(0.55 0.18 264)",
                          color: "white",
                        }
                      : {
                          background: "transparent",
                          color: "oklch(0.72 0.01 264)",
                          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.13)",
                        }
                  }
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-12 py-8 border-t border-white/[0.07] flex items-center"
      >
        <span className="text-[14px] font-semibold tracking-[-0.02em]">Anvil</span>
        <div className="ml-8 flex gap-5 text-[12px] text-[oklch(0.50_0.01_264)]">
          <Link href="/privacy" className="hover:text-[oklch(0.72_0.01_264)] transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[oklch(0.72_0.01_264)] transition-colors">
            Terms
          </Link>
          <a
            href="mailto:hello@anvil.app"
            className="hover:text-[oklch(0.72_0.01_264)] transition-colors"
          >
            Contact
          </a>
        </div>
        <span className="flex-1" />
        <span className="text-[11px] text-[oklch(0.38_0.008_264)]">
          © {new Date().getFullYear()} Anvil. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
