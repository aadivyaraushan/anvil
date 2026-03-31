import { StateGraph, END } from "@langchain/langgraph";
import { SynthesisStateAnnotation } from "./state";
import { fetchData, extractAll, synthesize, saveSynthesis } from "./nodes";

export function buildSynthesisGraph() {
  return new StateGraph(SynthesisStateAnnotation)
    .addNode("fetchData", fetchData)
    .addNode("extractAll", extractAll)
    .addNode("synthesize", synthesize)
    .addNode("saveSynthesis", saveSynthesis)
    .addEdge("__start__", "fetchData")
    .addEdge("fetchData", "extractAll")
    .addEdge("extractAll", "synthesize")
    .addEdge("synthesize", "saveSynthesis")
    .addEdge("saveSynthesis", END)
    .compile();
}
