"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
  interviewId: string;
};

export function GenerateBriefButton({ projectId, interviewId }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/projects/${projectId}/interviews/${interviewId}/brief`, {
      method: "POST",
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "Starting..." : "Generate Brief"}
    </Button>
  );
}
