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
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: input.name,
          idea_description: input.idea_description,
          target_profile: input.target_profile,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Project;
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
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);
      if (error) throw error;
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
  });
}
