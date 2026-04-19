import { Annotation } from "@langchain/langgraph";
import type { ExtractionInput } from "./prompts";

export type CompletedInterview = {
  id: string;
  contact_id: string | null;
  transcript: Array<{ speaker: string; text: string; timestamp: number }>;
};

export type ContactMap = Record<
  string,
  { name: string; title: string; company: string }
>;

export type AnalystResult = {
  summary: string;
  painPoints: Array<{
    description: string;
    severity: string;
    frequency: number;
    quotes: Array<{ text: string; contact_id: string; interview_id: string }>;
  }>;
  patterns: Array<{
    name: string;
    description: string;
    interviewIds: string[];
  }>;
  keyQuotes: Array<{ quote: string; contact_id: string; interview_id: string }>;
  saturationScore: number;
  uniquePatternCount: number;
  recommendations: string[];
};

export const AnalystStateAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  projectName: Annotation<string>(),
  ideaDescription: Annotation<string>(),
  targetProfile: Annotation<string>(),

  interviews: Annotation<CompletedInterview[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),
  contacts: Annotation<ContactMap>({
    default: () => ({}),
    reducer: (_, next) => next,
  }),
  extractedData: Annotation<ExtractionInput[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),
  analystResult: Annotation<AnalystResult | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
});

export type AnalystState = typeof AnalystStateAnnotation.State;
