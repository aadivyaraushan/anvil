import { getProject } from "@/lib/actions/projects";
import { ArchetypeSetup } from "@/components/archetype-setup";
import { notFound } from "next/navigation";

export default async function ArchetypesPage({
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

  return (
    <div className="min-h-screen bg-background">
      <ArchetypeSetup project={project} />
    </div>
  );
}
