import { StateGraph, END } from "@langchain/langgraph";
import { PrototypeStateAnnotation, type PrototypeState } from "./state";
import {
  architect,
  uxDesigner,
  developer,
  buildAndVerify,
  reviewer,
  deploy,
} from "./nodes";

const MAX_ROUNDS = 3;

function afterBuild(state: PrototypeState): "developer" | "reviewer" {
  if (state.buildErrors && state.reviewRounds < MAX_ROUNDS) {
    return "developer"; // fix build errors
  }
  return "reviewer";
}

function afterReview(state: PrototypeState): "developer" | "deploy" {
  if (state.reviewFeedback && state.reviewRounds < MAX_ROUNDS) {
    return "developer"; // incorporate review feedback
  }
  return "deploy";
}

export function buildPrototypeGraph() {
  return new StateGraph(PrototypeStateAnnotation)
    .addNode("architect", architect)
    .addNode("uxDesigner", uxDesigner)
    .addNode("developer", developer)
    .addNode("buildAndVerify", buildAndVerify)
    .addNode("reviewer", reviewer)
    .addNode("deploy", deploy)
    .addEdge("__start__", "architect")
    .addEdge("architect", "uxDesigner")
    .addEdge("uxDesigner", "developer")
    .addEdge("developer", "buildAndVerify")
    .addConditionalEdges("buildAndVerify", afterBuild, {
      developer: "developer",
      reviewer: "reviewer",
    })
    .addConditionalEdges("reviewer", afterReview, {
      developer: "developer",
      deploy: "deploy",
    })
    .addEdge("deploy", END)
    .compile();
}
