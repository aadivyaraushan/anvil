import { StateGraph, END } from "@langchain/langgraph";
import { AnalystStateAnnotation } from "./state";
import { fetchData, extractAll, synthesize, saveAnalyst } from "./nodes";

export function buildAnalystGraph() {
  return new StateGraph(AnalystStateAnnotation)
    .addNode("fetchData", fetchData)
    .addNode("extractAll", extractAll)
    .addNode("synthesize", synthesize)
    .addNode("saveAnalyst", saveAnalyst)
    .addEdge("__start__", "fetchData")
    .addEdge("fetchData", "extractAll")
    .addEdge("extractAll", "synthesize")
    .addEdge("synthesize", "saveAnalyst")
    .addEdge("saveAnalyst", END)
    .compile();
}
