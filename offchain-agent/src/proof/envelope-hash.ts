import { hashProofBundle } from "./hash.js";
import { canonicalEnvelopePayload } from "./envelope-canonical.js";
import type { AttestGuardEnvelope } from "./envelope.js";

export function hashEnvelope(
  envelope: AttestGuardEnvelope
): string {
  return hashProofBundle(
    canonicalEnvelopePayload(envelope)
  );
}
