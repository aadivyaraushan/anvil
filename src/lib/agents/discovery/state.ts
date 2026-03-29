import { Annotation } from "@langchain/langgraph";
import type { Contact } from "@/lib/supabase/types";

export const DiscoveryStateAnnotation = Annotation.Root({
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
  currentIndex: Annotation<number>({
    default: () => 0,
    reducer: (_, incoming) => incoming,
  }),
  errors: Annotation<string[]>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
});

export type DiscoveryState = typeof DiscoveryStateAnnotation.State;
