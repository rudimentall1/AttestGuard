import type { AttestGuardEnvelope } from "./envelope.js";

export function canonicalEnvelopePayload(
  envelope: AttestGuardEnvelope
) {
  return {
    protocol: envelope.protocol,
    version: envelope.version,
    issuer: envelope.issuer,
    createdAt: envelope.createdAt,

    proofHash: envelope.proof.proofHash,

    signatureAlgorithm:
      envelope.signature.algorithm,

    signer:
      envelope.signature.signer
  };
}
