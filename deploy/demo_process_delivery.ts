import "dotenv/config";
import { Contract, ethers } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

import managerAbi from "../contracts/abi/AttestGuardManager.json" with { type: "json" };

async function main() {
  const txHash = process.env.DEMO_TX_HASH;
  if (!txHash) throw new Error("Set DEMO_TX_HASH (the confirmDelivery tx hash on Sepolia) first");

  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");

  const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY ?? "1");
  const proofBuilderUrl = process.env.PROOF_BUILDER_URL;
  if (!proofBuilderUrl) throw new Error("Set PROOF_BUILDER_URL in .env first");

  const creditcoinRpcUrl = process.env.CREDITCOIN_RPC_URL;
  const sourceChainRpcUrl = process.env.SOURCE_CHAIN_RPC_URL;
  const privateKey = process.env.CREDITCOIN_WALLET_PRIVATE_KEY;
  if (!creditcoinRpcUrl || !sourceChainRpcUrl || !privateKey) {
    throw new Error("Set CREDITCOIN_RPC_URL, SOURCE_CHAIN_RPC_URL and CREDITCOIN_WALLET_PRIVATE_KEY in .env first");
  }

  const creditcoinProvider = new ethers.JsonRpcProvider(creditcoinRpcUrl);
  const creditcoinWallet = new ethers.Wallet(privateKey, creditcoinProvider);
  const manager = new Contract(managerAddress, managerAbi, creditcoinWallet);

  const sourceProvider = new ethers.JsonRpcProvider(sourceChainRpcUrl);

  const tx = await sourceProvider.getTransaction(txHash);
  if (!tx || tx.blockNumber == null) {
    throw new Error(`Transaction ${txHash} not found (or not yet mined) on the source chain`);
  }
  console.log(`Found tx ${txHash} in Sepolia block ${tx.blockNumber}`);

  const proofBuilder = new proofProvider.service.ProofBuilder(sourceChainKey, proofBuilderUrl);

  console.log(`Waiting for Creditcoin to attest block ${tx.blockNumber}... (this can take several minutes)`);
  await proofBuilder.waitUntilHeightAttested(sourceChainKey, tx.blockNumber);
  console.log("Block attested. Generating proof...");

  const proofResult = await proofBuilder.getProof(txHash);
  if (!proofResult.success || !proofResult.data) {
    throw new Error(`Proof generation failed: ${proofResult.error}`);
  }
  console.log("Proof generated successfully.");

  const { headerNumber, txBytes, merkleProof, continuityProof } = proofResult.data;

  const invoiceId = process.env.DEMO_INVOICE_ID;
  if (!invoiceId) throw new Error("Set DEMO_INVOICE_ID (from demo_register_advance.ts output) first");

  console.log("Submitting fundAdvanceFromQuery to AttestGuardManager...");
  const submitTx = await manager.fundAdvanceFromQuery(
    invoiceId,
    headerNumber,
    txBytes,
    merkleProof.root,
    merkleProof.siblings,
    continuityProof.lowerEndpointDigest,
    continuityProof.roots
  );
  const receipt = await submitTx.wait();
  console.log("\nSubmitted! Creditcoin tx hash:", receipt?.hash);

  const advance = await manager.getAdvance(invoiceId);
  console.log(
    "Advance status is now:",
    advance.status.toString(),
    "(2=AutoFunded, 3=PendingConfirmation — needs confirmPendingAdvance from the guardian, 4=Funded)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
