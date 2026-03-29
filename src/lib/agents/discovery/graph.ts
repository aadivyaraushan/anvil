import { StateGraph, START, END } from "@langchain/langgraph";
import { DiscoveryStateAnnotation } from "./state";
import {
  sourceContacts,
  researchContact,
  scoreContact,
  draftEmail,
  qualityCheck,
  sendOrQueue,
  routeNext,
} from "./nodes";
import type { DiscoveryState } from "./state";

function shouldDraftOrSkip(state: DiscoveryState): "draftEmail" | "routeNext" {
  const contact = state.contacts[state.currentIndex];
  if (!contact) return "routeNext";
  return contact.fit_status === "passed" ? "draftEmail" : "routeNext";
}

function shouldContinueOrEnd(state: DiscoveryState): "researchContact" | typeof END {
  const nextIndex = state.currentIndex;
  return nextIndex < state.contacts.length ? "researchContact" : END;
}

export function buildDiscoveryGraph() {
  return new StateGraph(DiscoveryStateAnnotation)
    .addNode("sourceContacts", sourceContacts)
    .addNode("researchContact", researchContact)
    .addNode("scoreContact", scoreContact)
    .addNode("draftEmail", draftEmail)
    .addNode("qualityCheck", qualityCheck)
    .addNode("sendOrQueue", sendOrQueue)
    .addNode("routeNext", routeNext)
    .addEdge(START, "sourceContacts")
    .addEdge("sourceContacts", "researchContact")
    .addEdge("researchContact", "scoreContact")
    .addConditionalEdges("scoreContact", shouldDraftOrSkip)
    .addEdge("draftEmail", "qualityCheck")
    .addEdge("qualityCheck", "sendOrQueue")
    .addEdge("sendOrQueue", "routeNext")
    .addConditionalEdges("routeNext", shouldContinueOrEnd)
    .compile();
}
