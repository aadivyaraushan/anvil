/**
 * Unit tests for the analyst archetype-proposal threshold.
 *
 * The analyst should propose archetypes (status = 'suggested') when:
 * - There are ≥2 completed interviews for the project, AND
 * - No confirmed personas exist yet.
 */
import { describe, expect, it } from "vitest";

type Persona = { status: "suggested" | "confirmed" };
type Interview = { status: string };

function shouldProposeArchetypes(
  interviews: Interview[],
  existingPersonas: Persona[]
): boolean {
  const completed = interviews.filter((i) => i.status === "completed").length;
  const hasConfirmed = existingPersonas.some((p) => p.status === "confirmed");
  return completed >= 2 && !hasConfirmed;
}

describe("analyst archetype proposal threshold", () => {
  it("proposes when ≥2 completed interviews and no personas", () => {
    expect(
      shouldProposeArchetypes(
        [{ status: "completed" }, { status: "completed" }],
        []
      )
    ).toBe(true);
  });

  it("proposes when ≥2 completed and only suggested personas exist", () => {
    expect(
      shouldProposeArchetypes(
        [{ status: "completed" }, { status: "completed" }],
        [{ status: "suggested" }]
      )
    ).toBe(true);
  });

  it("does NOT propose when fewer than 2 completed interviews", () => {
    expect(
      shouldProposeArchetypes([{ status: "completed" }], [])
    ).toBe(false);
  });

  it("does NOT propose when confirmed personas already exist", () => {
    expect(
      shouldProposeArchetypes(
        [{ status: "completed" }, { status: "completed" }],
        [{ status: "confirmed" }]
      )
    ).toBe(false);
  });

  it("does NOT propose with 0 interviews", () => {
    expect(shouldProposeArchetypes([], [])).toBe(false);
  });

  it("does NOT propose when interviews are pending/scheduled but not completed", () => {
    expect(
      shouldProposeArchetypes(
        [{ status: "scheduled" }, { status: "in-progress" }],
        []
      )
    ).toBe(false);
  });

  it("proposes with 3+ completed interviews", () => {
    expect(
      shouldProposeArchetypes(
        [
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
        ],
        []
      )
    ).toBe(true);
  });
});
