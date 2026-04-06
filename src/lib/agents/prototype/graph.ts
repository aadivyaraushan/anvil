import { StateGraph, END } from "@langchain/langgraph";
import { PrototypeStateAnnotation, type PrototypeState } from "./state";
import {
  architect,
  uxDesigner,
  developer,
  buildAndVerify,
  reviewer,
  deploy,
  failBuild,
  failReview,
} from "./nodes";

const MAX_ROUNDS = 3;

function afterBuild(
  state: PrototypeState
): "developer" | "reviewer" | "failBuild" {
  if (state.buildErrors && state.reviewRounds < MAX_ROUNDS) {
    return "developer"; // fix build errors
  }
  if (state.buildErrors) {
    return "failBuild";
  }
  return "reviewer";
}

function afterReview(
  state: PrototypeState
): "developer" | "deploy" | "failReview" {
  if (state.reviewFeedback && state.reviewRounds < MAX_ROUNDS) {
    return "developer"; // incorporate review feedback
  }
  if (state.reviewFeedback) {
    return "failReview";
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
    .addNode("failBuild", failBuild)
    .addNode("failReview", failReview)
    .addEdge("__start__", "architect")
    .addEdge("architect", "uxDesigner")
    .addEdge("uxDesigner", "developer")
    .addEdge("developer", "buildAndVerify")
    .addConditionalEdges("buildAndVerify", afterBuild, {
      developer: "developer",
      reviewer: "reviewer",
      failBuild: "failBuild",
    })
    .addConditionalEdges("reviewer", afterReview, {
      developer: "developer",
      deploy: "deploy",
      failReview: "failReview",
    })
    .addEdge("deploy", END)
    .addEdge("failBuild", END)
    .addEdge("failReview", END)
    .compile();
}
