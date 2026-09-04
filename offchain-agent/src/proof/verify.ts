import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function verifyProofBundle(
  bundle: AttestGuardProofBundle
): boolean {

  if (bundle.protocol !== "AttestGuard") {
    return false;
  }

  if (bundle.artifact.type !== "AI_UNDERWRITING_PROOF") {
    return false;
  }

  if (!bundle.subject.invoiceId) {
    return false;
  }

  if (!bundle.hashes.decisionHash) {
    return false;
  }

  if (!bundle.hashes.evidenceHash) {
    return false;
  }

  if (!bundle.hashes.aiTraceHash) {
    return false;
  }

  if (!bundle.hashes.reportHash) {
    return false;
  }

  if (bundle.ai.authority !== "ADVISORY_ONLY") {
    return false;
  }

  return (
    bundle.verification.reportIntegrity &&
    bundle.verification.policyIntegrity &&
    bundle.verification.aiBoundaryIntegrity
  );
}