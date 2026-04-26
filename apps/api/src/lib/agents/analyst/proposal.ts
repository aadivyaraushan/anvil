/**
 * Decides whether the analyst should auto-propose archetypes.
 *
 * The analyst proposes (status: 'suggested') when the project is past the
 * "tell us what you're seeing" threshold — ≥2 completed interviews — but the
 * user hasn't started shaping personas yet. Once *any* persona exists
 * (suggested OR confirmed) the user is in control and the analyst should not
 * inject more.
 */

export type ProposalPersona = { status: "suggested" | "confirmed" };

export type ProposalDecisionInput = {
  /** Number of completed interviews tied to the project. */
  completedInterviewCount: number;
  /** All personas currently attached to the project. */
  existingPersonas: ProposalPersona[];
};

export const MIN_COMPLETED_INTERVIEWS_FOR_PROPOSAL = 2;

export function shouldProposeArchetypes(input: ProposalDecisionInput): boolean {
  if (input.completedInterviewCount < MIN_COMPLETED_INTERVIEWS_FOR_PROPOSAL) {
    return false;
  }
  // Any existing persona — suggested or confirmed — means hands-off.
  return input.existingPersonas.length === 0;
}
