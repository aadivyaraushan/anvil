import { StateGraph, END } from "@langchain/langgraph";
import { BriefStateAnnotation } from "./state";
import { searchInterviewee, synthesizeBrief, saveBrief } from "./nodes";

export function buildBriefGraph() {
  return new StateGraph(BriefStateAnnotation)
    .addNode("searchInterviewee", searchInterviewee)
    .addNode("synthesizeBrief", synthesizeBrief)
    .addNode("saveBrief", saveBrief)
    .addEdge("__start__", "searchInterviewee")
    .addEdge("searchInterviewee", "synthesizeBrief")
    .addEdge("synthesizeBrief", "saveBrief")
    .addEdge("saveBrief", END)
    .compile();
}
