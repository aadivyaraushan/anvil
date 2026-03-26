import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/supabase/types";

const statusLabels: Record<string, string> = {
  pending: "Not started",
  generating: "Building prototype",
  deployed: "Active",
  failed: "Prototype failed",
};

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/project/${project.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <Badge variant="secondary">
              {statusLabels[project.prototype_status] ?? project.prototype_status}
            </Badge>
          </div>
          <CardDescription className="line-clamp-2">
            {project.idea_description || "No description yet"}
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Created{" "}
            {new Date(project.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </CardHeader>
      </Card>
    </Link>
  );
}
