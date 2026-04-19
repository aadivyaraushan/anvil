import { getProject, updateProject } from "@/lib/actions/projects";
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
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProjectSettingsPage({
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

  const updateProjectWithId = updateProject.bind(null, id);

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href={`/project/${id}`}>
          <Button variant="ghost" size="sm">
            &larr; Back to workspace
          </Button>
        </Link>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>
              Update your project name, idea, and target profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateProjectWithId} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={project.name}
                />
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
              <Button type="submit" className="w-fit">
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
