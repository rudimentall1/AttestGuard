import type { AttestGuardEnvelope } from "./envelope.js";

import { verifyEnvelope } from "./envelope-verify.js";
import { verifyEnvelopeSignature } from "./envelope-sign-verify.js";


export function loadVerifiedEnvelope(
  envelope: AttestGuardEnvelope
): AttestGuardEnvelope {

  if (!verifyEnvelope(envelope)) {
    throw new Error("INVALID_ENVELOPE");
  }


  if (!verifyEnvelopeSignature(envelope)) {
    throw new Error("INVALID_SIGNATURE");
  }


  return envelope;
}
