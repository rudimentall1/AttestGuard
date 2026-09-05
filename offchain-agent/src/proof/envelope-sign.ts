import { Wallet } from "ethers";
import type { AttestGuardEnvelope } from "./envelope.js";

export const ENVELOPE_DOMAIN = {
  name: "AttestGuard",
  version: "1",
  chainId: 1,
} as const;

export const ENVELOPE_TYPES = {
  AttestGuardEnvelope: [
    { name: "protocol", type: "string" },
    { name: "version", type: "string" },
    { name: "issuer", type: "string" },
    { name: "createdAt", type: "string" },
    { name: "proofHash", type: "string" },
  ],
} as const;

export async function signEnvelope(
  envelope: AttestGuardEnvelope,
  wallet: Wallet
): Promise<AttestGuardEnvelope> {
  const proofHash = envelope.proof.reportHash;

  const value = await wallet.signTypedData(
    ENVELOPE_DOMAIN,
    ENVELOPE_TYPES,
    {
      protocol: envelope.protocol,
      version: envelope.version,
      issuer: envelope.issuer,
      createdAt: envelope.createdAt,
      proofHash,
    }
  );

  return {
    ...envelope,
    signature: {
      algorithm: "EIP712",
      signer: await wallet.getAddress(),
      value,
    },
  };
}
