import type { VerificationResult } from "./attestguard-verify.js";
import { verifyAttestGuardEnvelope } from "./attestguard-verify.js";


export function verifyAttestGuardJson(
  json: string
): VerificationResult {

  try {

    const envelope =
      JSON.parse(json);

    return verifyAttestGuardEnvelope(
      envelope
    );

  } catch (error) {

    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "INVALID_JSON"
    };

  }
}
