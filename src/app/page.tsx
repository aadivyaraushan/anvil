import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PricingSection } from "@/components/pricing-section";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-base font-bold text-foreground">Anvil</span>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-24 pb-16 text-center">
        <h1
          className="max-w-3xl text-5xl font-bold"
          style={{
            letterSpacing: "-0.03em",
            background: "linear-gradient(180deg, #fafafa 40%, #71717a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Customer discovery on autopilot
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
          Four AI agents find candidates, assist live interviews, synthesize
          insights, and ship a prototype. One workspace, end to end.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup">
            <Button size="lg">Get started</Button>
          </Link>
          <a href="#pricing">
            <Button variant="outline" size="lg">
              See pricing
            </Button>
          </a>
        </div>
      </section>

      {/* Workspace Mockup */}
      <section className="flex justify-center px-6 pb-24">
        <div
          className="w-full max-w-5xl overflow-hidden rounded-xl border border-border"
          style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}
        >
          {/* Fake browser chrome */}
          <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[#3f3f46]" />
              <div className="h-3 w-3 rounded-full bg-[#3f3f46]" />
              <div className="h-3 w-3 rounded-full bg-[#3f3f46]" />
            </div>
            <div className="ml-4 flex-1 rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground font-mono">
              app.useanvil.com/project/fintech-discovery
            </div>
          </div>

          {/* Three-column workspace */}
          <div className="grid grid-cols-3 divide-x divide-border bg-background">
            {/* Discovery Column */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Discovery
                </span>
                <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  Agent 1
                </span>
              </div>
              {[
                { name: "Sarah Chen", company: "FinFlow", fit: 92 },
                { name: "James Park", company: "LendBase", fit: 87 },
                { name: "Mia Torres", company: "QuickCap", fit: 78 },
              ].map((contact) => (
                <div
                  key={contact.name}
                  className="rounded-lg bg-card p-3 border border-border"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {contact.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {contact.fit}% fit
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {contact.company}
                  </p>
                  <div className="mt-2 h-1 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${contact.fit}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Interviews Column */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Interviews
                </span>
                <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  Agent 2
                </span>
              </div>
              <div className="rounded-lg bg-card p-3 border-l-2 border-l-primary border border-border">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="text-[10px] font-medium text-foreground">
                    Live — Sarah Chen
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground font-mono leading-relaxed">
                  &quot;We tried three different tools but none handled
                  reconciliation well...&quot;
                </p>
                <div className="mt-2 rounded-md bg-accent px-2 py-1.5">
                  <p className="text-[10px] text-accent-foreground">
                    Suggested: &quot;What does your reconciliation workflow
                    look like today?&quot;
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-card p-3 border border-border">
                <span className="text-[10px] text-muted-foreground">
                  James Park — Scheduled 3:00 PM
                </span>
              </div>
            </div>

            {/* Synthesis Column */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Synthesis
                </span>
                <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  Agent 3
                </span>
              </div>
              <div className="rounded-lg bg-card p-3 border border-border">
                <span className="text-[10px] font-medium text-foreground">
                  Top pain point
                </span>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Manual reconciliation across multiple banking platforms
                </p>
              </div>
              <div className="rounded-lg bg-card p-3 border border-border">
                <span className="text-[10px] font-medium text-foreground">
                  Research saturation
                </span>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: "68%",
                        background:
                          "linear-gradient(90deg, #2563eb, #60a5fa)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-accent-foreground">
                    68%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Workflow */}
      <section className="border-t border-border px-6 py-20">
        <h2
          className="text-center text-[28px] font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          Meet the agents
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[15px] leading-relaxed text-muted-foreground">
          Four specialised AI agents work in sequence to take you from idea to
          validated prototype.
        </p>

        {/* Flow chart */}
        <div className="mx-auto mt-12 flex max-w-5xl flex-col items-center gap-0 md:flex-row md:items-stretch md:justify-center">
          {[
            {
              number: "01",
              name: "Discovery",
              color: "#2563eb",
              desc: "Finds and qualifies customer interview candidates. Sources contacts, researches backgrounds, scores fit, and sends personalised outreach emails automatically.",
            },
            {
              number: "02",
              name: "Interview Copilot",
              color: "#7c3aed",
              desc: "Joins live calls, transcribes in real-time, and surfaces follow-up questions focused on pain points — so you never miss a key insight mid-conversation.",
            },
            {
              number: "03",
              name: "Synthesis",
              color: "#0891b2",
              desc: "Analyses completed interviews, extracts patterns and pain points, scores research saturation, and keeps a living insight document always up to date.",
            },
            {
              number: "04",
              name: "Prototype",
              color: "#059669",
              desc: "Turns validated insights into a working product. Architects, designs, codes, verifies, and deploys a live prototype to GitHub and Vercel automatically.",
            },
          ].map((agent, i, arr) => (
            <div
              key={agent.number}
              className="flex flex-col items-center md:flex-row md:items-stretch"
              style={{ flex: "1 1 0" }}
            >
              {/* Agent card */}
              <div
                className="flex w-full flex-col rounded-2xl border border-border bg-card p-5 md:w-auto"
                style={{ flex: "1 1 0", minWidth: 0 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ background: agent.color }}
                  >
                    {agent.number}
                  </span>
                  <span
                    className="text-[13px] font-semibold text-foreground"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {agent.name}
                  </span>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                  {agent.desc}
                </p>
              </div>

              {/* Arrow connector — hidden after last item */}
              {i < arr.length - 1 && (
                <div className="flex items-center justify-center py-3 md:px-3 md:py-0">
                  {/* Down arrow on mobile, right arrow on desktop */}
                  <svg
                    className="block md:hidden"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="M10 3v11M10 14l-4-4M10 14l4-4"
                      stroke="#52525b"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="hidden md:block"
                    width="28"
                    height="20"
                    viewBox="0 0 28 20"
                    fill="none"
                  >
                    <path
                      d="M4 10h17M21 10l-5-5M21 10l-5 5"
                      stroke="#52525b"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-border px-6 py-20"
      >
        <h2
          className="text-center text-[28px] font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          How it works
        </h2>
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-3 gap-8">
          {[
            {
              step: 1,
              title: "Describe your idea",
              desc: "Tell Anvil what you're building and who to talk to.",
            },
            {
              step: 2,
              title: "Run interviews",
              desc: "AI copilot joins calls, transcribes, suggests questions.",
            },
            {
              step: 3,
              title: "Get insights",
              desc: "Living research document auto-updates after each interview.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex flex-col items-center text-center">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-accent-foreground"
                style={{ background: "rgba(37,99,235,0.15)" }}
              >
                {step}
              </div>
              <h3
                className="mt-4 text-[15px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.02em" }}
              >
                {title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-[#3f3f46]">
        Built by Team Anvil
      </footer>
    </div>
  );
}
