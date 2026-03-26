import { NewProjectForm } from "@/components/new-project-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewProjectPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            &larr; Back to projects
          </Button>
        </Link>
      </div>
      <NewProjectForm />
    </div>
  );
}
