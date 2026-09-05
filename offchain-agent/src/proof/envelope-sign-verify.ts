import { verifyTypedData } from "ethers";
import type { AttestGuardEnvelope } from "./envelope.js";
import { ENVELOPE_DOMAIN, ENVELOPE_TYPES } from "./envelope-sign.js";

export function verifyEnvelopeSignature(
  envelope: AttestGuardEnvelope
): boolean {
  if (envelope.signature.algorithm !== "EIP712") {
    return false;
  }

  try {
    const recovered = verifyTypedData(
      ENVELOPE_DOMAIN,
      ENVELOPE_TYPES,
      {
        protocol: envelope.protocol,
        version: envelope.version,
        issuer: envelope.issuer,
        createdAt: envelope.createdAt,
        proofHash: envelope.proof.reportHash,
      },
      envelope.signature.value
    );

    return recovered.toLowerCase() === envelope.signature.signer.toLowerCase();
  } catch {
    return false;
  }
}
