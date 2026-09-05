import { hashEnvelope } from "./envelope-hash.js";
import type { AttestGuardEnvelope } from "./envelope.js";

export function signEnvelope(
  envelope: AttestGuardEnvelope,
  signer: string
): AttestGuardEnvelope {

  const envelopeHash = hashEnvelope(envelope);

  return {
    ...envelope,

    signature: {
      algorithm: "HASH_SIGNATURE",
      signer,
      value: envelopeHash
    }
  };
}
