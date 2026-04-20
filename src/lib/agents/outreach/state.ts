import { Annotation } from "@langchain/langgraph";
import type { Contact, Persona } from "@/lib/supabase/types";

export const OutreachStateAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  targetProfile: Annotation<string>(),
  ideaDescription: Annotation<string>(),
  senderName: Annotation<string>(),
  senderEmail: Annotation<string>(),
  autoSendEnabled: Annotation<boolean>(),
  contacts: Annotation<Contact[]>({
    default: () => [],
    reducer: (_, incoming) => incoming,
  }),
  personas: Annotation<Persona[]>({
    default: () => [],
    reducer: (_, incoming) => incoming,
  }),
  currentIndex: Annotation<number>({
    default: () => 0,
    reducer: (_, incoming) => incoming,
  }),
  errors: Annotation<string[]>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
});

export type OutreachState = typeof OutreachStateAnnotation.State;
