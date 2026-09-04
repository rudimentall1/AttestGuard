import type { AdvanceRequest, PolicyDecision, UnderwritingProposal } from "./types.js";

export type ReviewRoute =
  | "BLOCKED_BY_POLICY"
  | "ONCHAIN_GUARDIAN_REVIEW"
  | "AI_REVIEW_RECOMMENDED"
  | "AUTO_PATH";

export interface ReviewRouting {
  route: ReviewRoute;
  reason: string;
}

/**
 * Monotonic review routing.
 *
 * Deterministic policy is authoritative. AI may only make the operational
 * route more cautious; it can never weaken WARN/BLOCK into an automatic path.
 * This function is intentionally advisory and does not authorize or prevent
 * the on-chain transaction by itself.
 */
export function routeReview(
  request: AdvanceRequest,
  policy: PolicyDecision,
  underwriting: UnderwritingProposal
): ReviewRouting {
  if (policy.verdict === "BLOCK") {
    return {
      route: "BLOCKED_BY_POLICY",
      reason: `deterministic policy blocked the request: ${policy.reason}`,
    };
  }

  if (policy.verdict === "WARN") {
    return {
      route: "ONCHAIN_GUARDIAN_REVIEW",
      reason: `deterministic policy requires guardian review: ${policy.reason}`,
    };
  }

  const aiEscalates =
    underwriting.riskTier === "C" ||
    underwriting.riskTier === "D" ||
    underwriting.recommendedAdvance < request.requestedAdvanceAmount ||
    underwriting.reasonCodes.includes("POLICY_OVERRIDE_REQUIRED") ||
    underwriting.riskFlags.length > 0;

  if (aiEscalates) {
    return {
      route: "AI_REVIEW_RECOMMENDED",
      reason:
        "deterministic policy permits the auto path, but bounded underwriting recommends additional human attention",
    };
  }

  return {
    route: "AUTO_PATH",
    reason: "deterministic policy permits auto path and bounded underwriting raises no additional review signal",
  };
}

export function shouldHoldForReview(route: ReviewRoute): boolean {
  return route === "AI_REVIEW_RECOMMENDED";
}
