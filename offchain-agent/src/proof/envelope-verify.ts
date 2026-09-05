import type { AttestGuardEnvelope } from "./envelope.js";
import { verifyProofBundle } from "./verify.js";

export function verifyEnvelope(
  envelope: AttestGuardEnvelope
): boolean {

  if (envelope.protocol !== "ATTESTGUARD") {
    return false;
  }

  if (envelope.version !== "1.0") {
    return false;
  }

  if (!envelope.issuer) {
    return false;
  }

  if (!verifyProofBundle(envelope.proof)) {
    return false;
  }

  return true;
}
