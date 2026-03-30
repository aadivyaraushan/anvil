import { Annotation } from "@langchain/langgraph";

export const PrototypeStateAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  ideaDescription: Annotation<string>(),
  targetProfile: Annotation<string>(),
  projectName: Annotation<string>(),

  // Phase outputs
  architectSpec: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  designBrief: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  codeFiles: Annotation<Record<string, string> | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  buildErrors: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  reviewFeedback: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  reviewRounds: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),

  // Deploy outputs
  githubRepoUrl: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  prototypeUrl: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
});

export type PrototypeState = typeof PrototypeStateAnnotation.State;
