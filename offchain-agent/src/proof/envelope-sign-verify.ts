import type { AttestGuardEnvelope } from "./envelope.js";
import { hashEnvelope } from "./envelope-hash.js";

export function verifyEnvelopeSignature(
  envelope: AttestGuardEnvelope
): boolean {

  if (
    envelope.signature.algorithm !== "HASH_SIGNATURE"
  ) {
    return false;
  }

  const expected =
    hashEnvelope({
      ...envelope,
      signature: {
        algorithm: "NONE",
        signer: envelope.signature.signer,
        value: ""
      }
    });

  return (
    envelope.signature.value === expected
  );
}
