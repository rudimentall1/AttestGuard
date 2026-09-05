import type { AttestGuardEnvelope } from "./envelope.js";

import { loadVerifiedEnvelope } from "./envelope-loader.js";


export interface VerificationResult {
  valid: boolean;
  issuer?: string;
  proofHash?: string;
  error?: string;
}


export function verifyAttestGuardEnvelope(
  envelope: AttestGuardEnvelope
): VerificationResult {

  try {

    const verified =
      loadVerifiedEnvelope(envelope);


    return {
      valid: true,
      issuer: verified.issuer,
      proofHash: verified.proof.proofHash
    };

  } catch (error) {

    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR"
    };

  }
}
