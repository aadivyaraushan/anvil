/**
 * Unit tests for the analyst archetype-proposal threshold.
 *
 * Imports the real `shouldProposeArchetypes` helper used by the analyst graph
 * (lib/agents/analyst/proposal.ts and lib/agents/analyst/nodes.ts). The
 * previous version of this file inlined a copy of the logic, which silently
 * drifted from the real condition.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_COMPLETED_INTERVIEWS_FOR_PROPOSAL,
  shouldProposeArchetypes,
} from "@/lib/agents/analyst/proposal";

describe("shouldProposeArchetypes", () => {
  it("proposes when ≥2 completed interviews and no personas exist", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: 2,
        existingPersonas: [],
      })
    ).toBe(true);
  });

  it("does NOT propose when only suggested personas exist (user is mid-shaping)", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: 5,
        existingPersonas: [{ status: "suggested" }],
      })
    ).toBe(false);
  });

  it("does NOT propose when confirmed personas exist", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: 5,
        existingPersonas: [{ status: "confirmed" }],
      })
    ).toBe(false);
  });

  it("does NOT propose under the interview threshold", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: MIN_COMPLETED_INTERVIEWS_FOR_PROPOSAL - 1,
        existingPersonas: [],
      })
    ).toBe(false);
  });

  it("does NOT propose with 0 interviews", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: 0,
        existingPersonas: [],
      })
    ).toBe(false);
  });

  it("proposes well above the threshold", () => {
    expect(
      shouldProposeArchetypes({
        completedInterviewCount: 12,
        existingPersonas: [],
      })
    ).toBe(true);
  });

  it("threshold constant is the documented value (2)", () => {
    expect(MIN_COMPLETED_INTERVIEWS_FOR_PROPOSAL).toBe(2);
  });
});
