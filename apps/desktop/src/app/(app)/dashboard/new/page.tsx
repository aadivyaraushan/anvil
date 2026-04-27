"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateProject, PlanLimitError } from "@/lib/hooks/use-projects";
import { ErrorCard } from "@/components/error-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

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
      <div className="flex flex-col justify-center px-16 py-20 max-w-xl mx-auto w-full">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back to projects
        </Link>

        <div className="anvil-caps mb-4">New project</div>
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

          {createProject.error instanceof PlanLimitError ? (
            <div
              role="alert"
              data-testid="plan-limit-banner"
              className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-medium">{createProject.error.message}</p>
              <Link
                href="/billing"
                className="mt-1 inline-block text-amber-900 underline underline-offset-2"
              >
                Upgrade your plan →
              </Link>
            </div>
          ) : createProject.error ? (
            <ErrorCard error={createProject.error as Error} />
          ) : null}

          <Button
            onClick={handleFinish}
            disabled={!name.trim() || createProject.isPending}
            className="w-full"
          >
            {createProject.isPending ? "Creating..." : "Create project →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
