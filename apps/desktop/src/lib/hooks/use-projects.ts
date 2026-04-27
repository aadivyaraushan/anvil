import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import type { Project, Persona, AnalystDocument } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["project", id] as const,
  personas: (projectId: string) => ["personas", projectId] as const,
  analystDoc: (projectId: string) => ["analyst-document", projectId] as const,
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Project;
    },
    enabled: Boolean(id),
  });
}

// Plan-limit-aware project create. Routed through the api so the free-tier
// gate fires (apps/api/src/lib/billing/enforce.ts). The thrown error is a
// PlanLimitError when the server returns 422+code=PLAN_LIMIT, so callers can
// distinguish "you hit your limit, here's the upgrade flow" from "real
// failure, retry."
export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT" as const;
  readonly stage: string;
  constructor(message: string, stage: string) {
    super(message);
    this.name = "PlanLimitError";
    this.stage = stage;
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      idea_description: string;
      target_profile: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const res = await fetch(`${apiUrl}/api/projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          stage?: string;
        };
        if (body.code === "PLAN_LIMIT") {
          throw new PlanLimitError(
            body.error ?? "Plan limit reached.",
            body.stage ?? "project_create",
          );
        }
        throw new Error(body.error ?? `Project create failed: ${res.status}`);
      }

      return (await res.json()) as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<Project, "id" | "user_id" | "created_at">>;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(id) });
      const previous = queryClient.getQueryData<Project>(projectKeys.detail(id));
      if (previous) {
        queryClient.setQueryData<Project>(projectKeys.detail(id), {
          ...previous,
          ...updates,
        });
      }
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.detail(id), context.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const res = await fetch(`${apiUrl}/api/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Project delete failed: ${res.status}`);
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export function usePersonas(projectId: string) {
  return useQuery({
    queryKey: projectKeys.personas(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("personas")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Persona[];
    },
    refetchOnMount: "always",
    enabled: Boolean(projectId),
  });
}

export function useUpsertPersonas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      personas,
    }: {
      projectId: string;
      personas: Array<{
        name: string;
        description: string;
        job_titles: string[];
        pain_points: string[];
      }>;
    }) => {
      const supabase = getSupabase();

      const { error: deleteError } = await supabase
        .from("personas")
        .delete()
        .eq("project_id", projectId);
      if (deleteError) throw deleteError;

      if (personas.length > 0) {
        const { data, error: insertError } = await supabase
          .from("personas")
          .insert(personas.map((p) => ({ ...p, project_id: projectId })))
          .select();
        if (insertError) throw insertError;
        return data as Persona[];
      }

      return [] as Persona[];
    },
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.personas(projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Analyst document
// ---------------------------------------------------------------------------

export function useAnalystDocument(projectId: string) {
  return useQuery({
    queryKey: projectKeys.analystDoc(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("analyst_documents")
        .select("*")
        .eq("project_id", projectId)
        .single();
      return (data as AnalystDocument) ?? null;
    },
    enabled: Boolean(projectId),
    // Server-side analyst pipeline writes out-of-band; refetch on mount
    // so the findings rail reflects the latest run instead of serving
    // a stale "no findings yet" view from cache.
    refetchOnMount: "always",
  });
}
