export type FinalRoute =
  | "AUTO_PATH"
  | "REVIEW"
  | "BLOCKED_BY_POLICY";

export type AIRecommendation =
  | "AUTO_PATH"
  | "REVIEW"
  | "BLOCK";

export type AIBoundaryResult = {
  route: FinalRoute;
  aiApplied: boolean;
  reason: string;
};

export function applyAIBoundary(
  policyRoute: FinalRoute,
  aiRecommendation: AIRecommendation | undefined
): AIBoundaryResult {
  if (policyRoute === "BLOCKED_BY_POLICY") {
    return {
      route: "BLOCKED_BY_POLICY",
      aiApplied: false,
      reason: "deterministic policy block cannot be overridden",
    };
  }

  if (aiRecommendation === "REVIEW") {
    return {
      route: "REVIEW",
      aiApplied: true,
      reason: "AI escalation requires human review",
    };
  }

  return {
    route: policyRoute,
    aiApplied: false,
    reason: "AI recommendation stayed within deterministic boundary",
  };
}