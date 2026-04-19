import { getProjects } from "@/lib/actions/projects";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: "-0.02em" }}>Projects</h1>
          <p className="text-sm text-muted-foreground">
            Your customer research projects.
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button>New project</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No projects yet. Create one to get started.
          </p>
          <Link href="/dashboard/new" className="mt-4">
            <Button variant="secondary">Create your first project</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
