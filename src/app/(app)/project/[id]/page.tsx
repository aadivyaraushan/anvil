import { getProject } from "@/lib/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DiscoveryColumn } from "@/components/discovery-column";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Contact } from "@/lib/supabase/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  const isSetupPhase = project.prototype_status !== "deployed";

  // Fetch initial contacts for the Discovery column
  let initialContacts: Contact[] = [];
  if (!isSetupPhase) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });
    initialContacts = (data as Contact[]) ?? [];
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              &larr;
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            {project.prototype_url && (
              <a
                href={project.prototype_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                {project.prototype_url}
              </a>
            )}
          </div>
        </div>
        <Link href={`/project/${id}/settings`}>
          <Button variant="ghost" size="sm">
            Settings
          </Button>
        </Link>
      </div>

      {isSetupPhase ? (
        /* Phase 1: Prototype building */
        <div className="flex flex-1 items-center justify-center p-8">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Building your prototype</CardTitle>
              <CardDescription>
                The prototype agents are generating a working MVP of your idea.
                This runs once before discovery begins.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    {project.prototype_status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {project.prototype_status === "pending" &&
                      "Waiting to start..."}
                    {project.prototype_status === "generating" &&
                      "Agents are building your prototype..."}
                    {project.prototype_status === "failed" &&
                      "Prototype generation failed. Check settings."}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Phase 2: Three-column workspace */
        <div className="grid flex-1 grid-cols-3 divide-x divide-[#1a1a1e] overflow-hidden">
          {/* Discovery Column */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Discovery</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 1
              </Badge>
            </div>
            <DiscoveryColumn project={project} initialContacts={initialContacts} />
          </div>

          {/* Interviews Column */}
          <div className="flex flex-col overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Interviews</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 2
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Live interviews and copilot suggestions will appear here.
            </p>
          </div>

          {/* Synthesis Column */}
          <div className="flex flex-col overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Synthesis</h2>
              <Badge variant="outline" className="border-0 bg-accent text-accent-foreground text-xs">
                Agent 3
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Research synthesis, patterns, and saturation will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="border-t bg-popover px-6 py-3">
        <p className="text-xs text-muted-foreground">
          Activity feed will show real-time events from all agents.
        </p>
      </div>
    </div>
  );
}
