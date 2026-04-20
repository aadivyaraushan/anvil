"use client";

import { createProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActionState } from "react";

export function NewProjectForm() {
  const [error, dispatch, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createProject(formData);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Something went wrong";
      }
    },
    null
  );

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Create a new project</CardTitle>
        <CardDescription>
          Describe your startup idea and target customer. Anvil will propose
          archetypes, score imported profiles, support interviews, and organize
          the evidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={dispatch} className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Fintech research sprint"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="idea_description">
              What are you building?
            </Label>
            <Textarea
              id="idea_description"
              name="idea_description"
              placeholder="Describe your startup idea in a few sentences. What problem does it solve? Who is it for?"
              rows={5}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="target_profile">
              Who do you want to interview?
            </Label>
            <Textarea
              id="target_profile"
              name="target_profile"
              placeholder="Describe the customer group you most want to understand. e.g. 'Controllers at vertical SaaS companies with lean finance teams'"
              rows={3}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
