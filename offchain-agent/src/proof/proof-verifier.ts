import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function verifyProofBundle(bundle: AttestGuardProofBundle): boolean {
  if (bundle.version !== "1.0") return false;
  if (bundle.type !== "UNDERWRITING_PROOF") return false;
  if (!bundle.invoiceId) return false;
  if (!bundle.decision.hash) return false;
  if (!bundle.decision.policy) return false;
  if (bundle.ai.authority !== "ADVISORY_ONLY") return false;
  if (!bundle.createdAt) return false;

  return true;
}
