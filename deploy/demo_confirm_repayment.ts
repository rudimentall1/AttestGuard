import "dotenv/config";
import hre from "hardhat";

/**
 * Calls confirmRepayment on the source-chain TradeConfirmation contract
 * (Sepolia). Mirrors demo_confirm_delivery.ts, but for the repayment leg:
 * this is the buyer attesting they've paid the advance back in full.
 * AttestGuardManager will independently re-verify this via Attestcoin
 * before it trusts it - see demo_process_repayment.ts.
 *
 * Usage:
 *   $env:DEMO_INVOICE_ID="0x..."; npx hardhat run deploy/demo_confirm_repayment.ts --network sepolia
 */
async function main() {
  const invoiceId = process.env.DEMO_INVOICE_ID;
  const sourceContractAddress = process.env.SOURCE_TRADE_CONFIRMATION_ADDRESS;
  if (!invoiceId) throw new Error("Set DEMO_INVOICE_ID (the invoice that was already funded) first");
  if (!sourceContractAddress) throw new Error("Set SOURCE_TRADE_CONFIRMATION_ADDRESS in .env first");

  const [deployer] = await hre.ethers.getSigners();
  const trade = await hre.ethers.getContractAt("TradeConfirmation", sourceContractAddress);

  const supplier = deployer.address;
  const amount = hre.ethers.parseEther("300");

  console.log("Confirming repayment on Sepolia:");
  console.log("  invoiceId:", invoiceId);
  console.log("  buyer (msg.sender):", deployer.address);
  console.log("  supplier:", supplier);
  console.log("  amount:", amount.toString());

  const tx = await trade.confirmRepayment(invoiceId, supplier, amount);
  const receipt = await tx.wait();

  console.log("\nConfirmed. Tx hash:", receipt?.hash);
  console.log("Now run demo_process_repayment.ts with this tx hash to submit the proof to AttestGuardManager:");
  console.log(
    `  $env:DEMO_TX_HASH="${receipt?.hash}"; $env:DEMO_INVOICE_ID="${invoiceId}"; npx hardhat run deploy/demo_process_repayment.ts --network creditcoin_testnet`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
