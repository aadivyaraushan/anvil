"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateProject } from "@/lib/hooks/use-projects";
import { ErrorCard } from "@/components/error-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.anvil.app";

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");

  async function handleFinish() {
    try {
      const project = await createProject.mutateAsync({
        name,
        idea_description: ideaDescription,
        target_profile: "",
      });
      router.push(`/project/${project.id}`);
    } catch {
      // error rendered via ErrorCard below
    }
  }

  return (
    <div className="flex min-h-full">
      {step === 1 ? (
        <div className="flex flex-col justify-center px-16 py-20 max-w-xl mx-auto w-full">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 inline-flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back to projects
          </Link>

          <div className="anvil-caps mb-4">Step 1 of 2 · New project</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] leading-[1.1] mb-8">
            What are you trying to learn?
          </h1>

          <div className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Finops research"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="idea_description">What&apos;s the idea or hypothesis?</Label>
              <Textarea
                id="idea_description"
                value={ideaDescription}
                onChange={(e) => setIdeaDescription(e.target.value)}
                placeholder="Describe the product idea, problem space, or questions you want to answer..."
                rows={5}
              />
            </div>

            {createProject.error && (
              <ErrorCard error={createProject.error as Error} />
            )}

            <Button
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              className="w-full"
            >
              Next →
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 w-full min-h-full">
          {/* Left column */}
          <div className="flex flex-col justify-center px-16 py-[72px]">
            <div className="anvil-caps mb-3.5">Step 2 of 2 · Install the Mac app</div>
            <h1 className="text-[40px] font-semibold tracking-[-0.03em] leading-[1.05] max-w-[480px]">
              Anvil captures every conversation.{" "}
              <span className="anvil-serif text-muted-foreground">Web, phone, in person.</span>
            </h1>
            <p className="mt-[18px] text-[15.5px] leading-[1.55] text-muted-foreground max-w-[480px]">
              A small native app lives in your menu bar. Hit{" "}
              <kbd className="anvil-mono bg-muted px-1.5 py-0.5 rounded text-sm text-foreground">⌥⌘R</kbd>{" "}
              before a call and it records mic + system audio. Transcripts and findings flow back to the web.
            </p>

            <div className="mt-8 flex gap-2.5 items-center">
              <a
                href="https://releases.anvil.app/Anvil-latest.dmg"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(90deg)" }}>
                  <path d="M8 2v10M4 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download for Mac
              </a>
              <button className="inline-flex items-center px-5 py-2.5 rounded-lg font-medium text-sm text-muted-foreground hover:bg-muted transition-colors">
                Send to my Mac
              </button>
            </div>

            <div className="mt-[22px] flex gap-[18px] text-xs text-muted-foreground">
              <span>macOS 13+ · Apple silicon + Intel</span>
              <span>·</span>
              <span>Works offline</span>
            </div>

            <div className="mt-11 pt-5 border-t border-border flex gap-3 items-center text-xs text-muted-foreground">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 opacity-50">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Optional: connect Google Calendar so Anvil prefills attendee names and reminds you before 1:1s.</span>
              <a
                href={`${API_URL}/api/calendar/google/connect`}
                className="shrink-0 px-2 py-1 rounded text-foreground hover:bg-muted transition-colors"
              >
                Connect
              </a>
            </div>

            {createProject.error && (
              <ErrorCard error={createProject.error as Error} className="mt-4" />
            )}

            <div className="mt-8 flex gap-3">
              <Button
                onClick={handleFinish}
                disabled={createProject.isPending}
                className="px-6"
              >
                {createProject.isPending ? "Creating..." : "Create project →"}
              </Button>
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
            </div>
          </div>

          {/* Right column — visual mock */}
          <div
            className="relative flex items-center justify-center overflow-hidden border-l border-border"
            style={{ background: "linear-gradient(160deg, oklch(0.26 0.06 264), oklch(0.16 0.04 280))" }}
          >
            {/* Menu bar strip */}
            <div
              className="absolute top-6 left-6 right-6 h-[26px] flex items-center px-3 gap-3.5 text-white text-[11px] rounded-[5px]"
              style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(20px)" }}
            >
              <span className="font-semibold"></span>
              <span className="font-semibold">Anvil</span>
              <span className="flex-1" />
              <span className="inline-flex items-center gap-1">
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--rose)" }} />
                Ready
              </span>
              <span className="opacity-60">Tue 2:14</span>
            </div>

            {/* Floating capsule card */}
            <div
              className="w-[320px] rounded-2xl flex flex-col gap-3.5 p-[18px]"
              style={{
                background: "oklch(0.145 0 0)",
                border: "1px solid oklch(0.3 0.002 264)",
                color: "oklch(0.985 0 0)",
                boxShadow: "0 20px 60px rgba(0,0,0,.5)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--azure)" }} />
                <div className="flex-1">
                  <div className="text-[13px] font-medium">Ready to record</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.552 0.013 264)" }}>
                    Choose a project · ⌥⌘R
                  </div>
                </div>
                <div className="anvil-mono text-[12px]" style={{ color: "oklch(0.552 0.013 264)" }}>
                  00:00
                </div>
              </div>

              {/* Waveform mock */}
              <div className="flex items-center gap-[2px] h-[18px] opacity-30">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px]"
                    style={{
                      height: 3 + Math.abs(Math.sin(i * 0.8 + 3)) * 12,
                      background: "oklch(0.552 0.013 264)",
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-1.5">
                <div
                  className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-md text-[12px] border cursor-default"
                  style={{ borderColor: "oklch(0.3 0.002 264)" }}
                >
                  {name || "Finops research"}
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(90deg)", marginLeft: 4, opacity: 0.5 }}>
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium"
                  style={{ background: "oklch(0.546 0.245 264)", color: "#fff" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--rose)" }} />
                  Start
                </div>
              </div>
            </div>

            {/* Bottom callouts */}
            <div
              className="absolute bottom-10 left-16 right-16 flex gap-5 text-[11px]"
              style={{ color: "rgba(255,255,255,.65)" }}
            >
              <div className="inline-flex gap-1.5 items-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Mic + system audio
              </div>
              <div className="inline-flex gap-1.5 items-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3l1.5 4.5H18l-3.75 2.75 1.5 4.5L12 12l-3.75 2.75 1.5-4.5L6 7.5h4.5L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                Works in Zoom, Meet, Teams
              </div>
              <div className="inline-flex gap-1.5 items-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12l5 5 11-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                In-person too
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
