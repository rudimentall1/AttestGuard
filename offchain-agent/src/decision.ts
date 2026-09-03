import { createHash } from "node:crypto";
import type { UnderwritingProposal } from "./types.js";

/**
 * Creates a stable identity for an underwriting decision.
 *
 * generatedAt is intentionally excluded: the same underwriting result over
 * the same evidence and model should have the same decision identity even if
 * it is regenerated later. The evidenceHash remains the cryptographic link
 * to the verified input set.
 */
export function hashUnderwritingDecision(proposal: UnderwritingProposal): string {
  const canonical = JSON.stringify({
    proposalVersion: proposal.proposalVersion,
    invoiceId: proposal.invoiceId,
    recommendedAdvance: proposal.recommendedAdvance.toString(),
    riskTier: proposal.riskTier,
    confidenceBps: proposal.confidenceBps,
    reasonCodes: [...proposal.reasonCodes].sort(),
    riskFlags: [...proposal.riskFlags].sort(),
    evidenceHash: proposal.evidenceHash,
    modelId: proposal.modelId,
    modelVersion: proposal.modelVersion,
  });

  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}
