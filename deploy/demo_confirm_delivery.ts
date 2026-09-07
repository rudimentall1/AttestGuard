import "dotenv/config";
import { Contract, ethers } from "ethers";
import hre from "hardhat";

import managerAbi from "../contracts/abi/AttestGuardManager.json" with { type: "json" };

async function main() {
  const invoiceId = process.env.DEMO_INVOICE_ID;
  const sourceContractAddress = process.env.SOURCE_TRADE_CONFIRMATION_ADDRESS;
  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  const creditcoinRpcUrl = process.env.CREDITCOIN_RPC_URL;
  if (!invoiceId) throw new Error("Set DEMO_INVOICE_ID (from demo_register_advance.ts output) first");
  if (!sourceContractAddress) throw new Error("Set SOURCE_TRADE_CONFIRMATION_ADDRESS in .env first");
  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");
  if (!creditcoinRpcUrl) throw new Error("Set CREDITCOIN_RPC_URL in .env first");

  const [deployer] = await hre.ethers.getSigners();
  const trade = await hre.ethers.getContractAt("TradeConfirmation", sourceContractAddress);

  // Read the real invoice amount from the manager on Creditcoin rather than
  // hardcoding a number here that has to be kept in sync by hand with
  // demo_register_advance.ts. AttestGuardManager rejects any delivery event
  // whose amount doesn't exactly match the registered invoiceAmount
  // (DeliveryAmountMismatch) -- a copy-pasted, out-of-sync literal here is
  // exactly what caused that revert before this fix.
  const creditcoinProvider = new ethers.JsonRpcProvider(creditcoinRpcUrl);
  const manager = new Contract(managerAddress, managerAbi, creditcoinProvider);
  const advance = await manager.getAdvance(invoiceId);
  if (advance.status === 0n) {
    throw new Error(`No advance registered for invoiceId ${invoiceId} -- run demo_register_advance.ts first`);
  }
  const supplier: string = advance.supplier;
  const amount: bigint = advance.invoiceAmount;

  console.log("Confirming delivery on Sepolia:");
  console.log("  invoiceId:", invoiceId);
  console.log("  buyer (msg.sender):", deployer.address);
  console.log("  supplier:", supplier);
  console.log("  amount (= registered invoiceAmount):", amount.toString());

  const tx = await trade.confirmDelivery(invoiceId, supplier, amount);
  const receipt = await tx.wait();

  console.log("\nConfirmed. Tx hash:", receipt?.hash);
  console.log("Now run: npx hardhat run deploy/demo_process_delivery.ts (with DEMO_TX_HASH set to the hash above)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
