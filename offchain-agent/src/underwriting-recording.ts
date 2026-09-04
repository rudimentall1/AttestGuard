import { Contract, ethers } from "ethers";

export type UnderwritingRecordResult =
  | "RECORDED_NOW"
  | "ALREADY_RECORDED";

export async function ensureUnderwritingDecisionRecorded(
  decisionRecorder: Contract,
  invoiceId: string,
  decisionHash: string
): Promise<UnderwritingRecordResult> {
  const existingHash = await decisionRecorder.underwritingDecisionHash(invoiceId);

  if (existingHash === ethers.ZeroHash) {
    const recordTx = await decisionRecorder.recordUnderwritingDecision(
      invoiceId,
      decisionHash
    );
    const recordReceipt = await recordTx.wait();

    console.log(
      `[worker] recorded underwriting decision on-chain, tx hash: ${recordReceipt?.hash}`
    );

    return "RECORDED_NOW";
  }

  if (existingHash === decisionHash) {
    console.log(
      `[worker] underwriting decision already recorded for ${invoiceId}; reusing existing commitment`
    );

    return "ALREADY_RECORDED";
  }

  throw new Error(
    `underwriting decision hash mismatch for ${invoiceId}: ` +
      `on-chain=${existingHash}, computed=${decisionHash}`
  );
}