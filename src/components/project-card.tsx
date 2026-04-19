import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Project } from "@/lib/supabase/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/project/${project.id}`}>
      <Card className="transition-colors hover:bg-accent-foreground/[0.08] hover:border-accent-foreground/20">
        <CardHeader>
          <CardTitle className="text-base">{project.name}</CardTitle>
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
