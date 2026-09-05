import type { AttestGuardProofBundle } from "./proof-bundle.js";

export interface AttestGuardEnvelope {
  protocol: "ATTESTGUARD";
  version: "1.0";

  issuer: string;

  createdAt: string;

  proof: AttestGuardProofBundle;

  signature: {
    algorithm: string;
    signer: string;
    value: string;
  };
}
