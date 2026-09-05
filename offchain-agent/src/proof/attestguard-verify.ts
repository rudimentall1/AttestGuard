import type { AttestGuardEnvelope } from "./envelope.js";

import { loadVerifiedEnvelope } from "./envelope-loader.js";


export interface VerificationResult {
  valid: boolean;
  issuer?: string;
  proofHash?: string;
  error?: string;
}


function mapVerificationError(
  error: unknown
): string {

  if (!(error instanceof Error)) {
    return "UNKNOWN_ERROR";
  }


  switch (error.message) {

    case "INVALID_ENVELOPE":
      return "PROOF_INTEGRITY_FAILED";

    case "INVALID_SIGNATURE":
      return "SIGNATURE_VERIFICATION_FAILED";

    default:
      return error.message;
  }
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
      error: mapVerificationError(error)
    };

  }
}
