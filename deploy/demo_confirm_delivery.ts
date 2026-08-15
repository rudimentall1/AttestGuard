import "dotenv/config";
import hre from "hardhat";

async function main() {
  const invoiceId = process.env.DEMO_INVOICE_ID;
  const sourceContractAddress = process.env.SOURCE_TRADE_CONFIRMATION_ADDRESS;
  if (!invoiceId) throw new Error("Set DEMO_INVOICE_ID (from demo_register_advance.ts output) first");
  if (!sourceContractAddress) throw new Error("Set SOURCE_TRADE_CONFIRMATION_ADDRESS in .env first");

  const [deployer] = await hre.ethers.getSigners();
  const trade = await hre.ethers.getContractAt("TradeConfirmation", sourceContractAddress);

  const supplier = deployer.address;
  const amount = hre.ethers.parseEther("300");

  console.log("Confirming delivery on Sepolia:");
  console.log("  invoiceId:", invoiceId);
  console.log("  buyer (msg.sender):", deployer.address);
  console.log("  supplier:", supplier);
  console.log("  amount:", amount.toString());

  const tx = await trade.confirmDelivery(invoiceId, supplier, amount);
  const receipt = await tx.wait();

  console.log("\nConfirmed. Tx hash:", receipt?.hash);
  console.log("Now run the off-chain worker to watch for this, fetch an Attestcoin proof, and fund the advance:");
  console.log("  npm run worker");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
