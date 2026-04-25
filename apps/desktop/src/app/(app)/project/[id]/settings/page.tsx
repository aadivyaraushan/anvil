"use client";

import { use, useState } from "react";
import { useProject, useUpdateProject } from "@/lib/hooks/use-projects";
import { mapError } from "@/lib/errors";
import { ErrorCard } from "@/components/error-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, error, isLoading } = useProject(id);
  const updateProject = useUpdateProject();
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateProject.mutateAsync({
      id,
      updates: {
        name: fd.get("name") as string,
        idea_description: fd.get("idea_description") as string,
        target_profile: fd.get("target_profile") as string,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <ErrorCard error={mapError(error ?? new Error("Project not found"))} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="mb-6 flex items-center gap-1">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            ← All projects
          </Button>
        </Link>
        <span className="text-muted-foreground/50 text-sm">/</span>
        <Link href={`/project/${id}`}>
          <Button variant="ghost" size="sm">
            Back to workspace
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            Update your project name, idea, and target profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" name="name" defaultValue={project.name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="idea_description">Idea description</Label>
              <Textarea
                id="idea_description"
                name="idea_description"
                defaultValue={project.idea_description}
                rows={5}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="target_profile">Target profile</Label>
              <Textarea
                id="target_profile"
                name="target_profile"
                defaultValue={project.target_profile}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateProject.isPending} className="w-fit">
                {updateProject.isPending ? "Saving…" : "Save changes"}
              </Button>
              {saved && (
                <span className="text-sm text-muted-foreground">Saved.</span>
              )}
            </div>
            {updateProject.error && (
              <ErrorCard error={mapError(updateProject.error)} />
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
