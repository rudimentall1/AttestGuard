import type { AttestGuardProofBundle } from "./proof-bundle.js";
import { verifyProofBundle } from "./verify.js";
import { importProofBundle } from "./import.js";

export function loadVerifiedProofBundle(
  json: string
): AttestGuardProofBundle {

  const bundle = importProofBundle(json);

  if (!verifyProofBundle(bundle)) {
    throw new Error("INVALID_PROOF_BUNDLE");
  }

  return bundle;
}
