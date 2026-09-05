import type { AttestGuardProofBundle } from "./proof-bundle.js";
import { hashProofBundle } from "./hash.js";

export function verifyProofBundle(
  bundle: AttestGuardProofBundle
): boolean {

  if (bundle.version !== "1.0") {
    return false;
  }

  if (bundle.schemaVersion !== "1.0") {
    return false;
  }

  if (bundle.hashAlgorithm !== "SHA256-CANONICAL") {
    return false;
  }

  if (bundle.type !== "UNDERWRITING_PROOF") {
    return false;
  }

  if (!bundle.invoiceId) {
    return false;
  }

  if (!bundle.decision.hash) {
    return false;
  }

  if (!bundle.decision.policy) {
    return false;
  }

  if (!bundle.decision.reason) {
    return false;
  }

  if (bundle.ai.authority !== "ADVISORY_ONLY") {
    return false;
  }

  if (!bundle.ai.recommendation) {
    return false;
  }

  if (!bundle.createdAt) {
    return false;
  }

  const expectedHash = hashProofBundle({
    invoiceId: bundle.invoiceId,
    decisionHash: bundle.decision.hash,
    evidenceHash: bundle.evidence.hash,
    aiTraceHash: bundle.ai.traceHash,
    reportHash: bundle.integrity.reportHash,
    policyDecision: bundle.decision.policy,
    policyReason: bundle.decision.reason,
    aiRecommendation: bundle.ai.recommendation,
    riskTier: bundle.evidence.riskTier,
    timestamp: bundle.createdAt,
  });

  if (bundle.proofHash !== expectedHash) {
    return false;
  }

  return true;
}



