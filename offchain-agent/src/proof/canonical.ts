import type { ProofBundleInput } from "./proof-bundle.js";

export function canonicalProofPayload(
  input: ProofBundleInput
) {
  return {
    invoiceId: input.invoiceId,
    decisionHash: input.decisionHash,
    evidenceHash: input.evidenceHash,
    aiTraceHash: input.aiTraceHash,
    reportHash: input.reportHash,
    policyDecision: input.policyDecision,
    policyReason: input.policyReason,
    aiRecommendation: input.aiRecommendation,
    riskTier: input.riskTier,
    timestamp: input.timestamp,
  };
}
