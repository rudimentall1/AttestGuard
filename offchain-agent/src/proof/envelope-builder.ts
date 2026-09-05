import type { AttestGuardEnvelope } from "./envelope.js";
import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function createEnvelope(
  proof: AttestGuardProofBundle,
  issuer: string
): AttestGuardEnvelope {

  return {
    protocol: "ATTESTGUARD",
    version: "1.0",

    issuer,

    createdAt: new Date().toISOString(),

    proof,

    signature: {
      algorithm: "NONE",
      signer: issuer,
      value: ""
    }
  };
}
