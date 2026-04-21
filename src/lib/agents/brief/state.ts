import { Annotation } from "@langchain/langgraph";
import type { InterviewBrief } from "@/lib/supabase/types";

export const BriefStateAnnotation = Annotation.Root({
  interviewId: Annotation<string>(),
  projectId: Annotation<string>(),
  ideaDescription: Annotation<string>(),
  targetProfile: Annotation<string>(),

  intervieweeName: Annotation<string>({
    default: () => "",
    reducer: (_, next) => next,
  }),
  intervieweeEmail: Annotation<string>({
    default: () => "",
    reducer: (_, next) => next,
  }),

  searchResults: Annotation<Array<{ title: string; url: string; content: string }>>({
    default: () => [],
    reducer: (_, next) => next,
  }),

  brief: Annotation<InterviewBrief | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
});

export type BriefState = typeof BriefStateAnnotation.State;
