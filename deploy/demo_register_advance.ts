import "dotenv/config";
import hre from "hardhat";

async function main() {
  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");

  const [deployer] = await hre.ethers.getSigners();
  const manager = await hre.ethers.getContractAt("AttestGuardManager", managerAddress);

  const invoiceId = hre.ethers.id("demo-invoice-" + Date.now());
  const supplier = deployer.address;
  const buyer = deployer.address;
  const invoiceAmount = hre.ethers.parseEther("1000");
  const requestedAdvanceAmount = hre.ethers.parseEther("300");

  console.log("Registering advance:");
  console.log("  invoiceId:", invoiceId);
  console.log("  supplier: ", supplier);
  console.log("  buyer:    ", buyer);
  console.log("  invoiceAmount:", invoiceAmount.toString());
  console.log("  requestedAdvanceAmount:", requestedAdvanceAmount.toString());

  const tx = await manager.registerAdvance(
    invoiceId,
    supplier,
    buyer,
    invoiceAmount,
    requestedAdvanceAmount,
    "demo advance, well within default auto-approve cap"
  );
  await tx.wait();

  console.log("\nRegistered. Now go confirm delivery on Sepolia with this EXACT invoiceId:");
  console.log(invoiceId);
  console.log("\nRun:");
  console.log(
    `  $env:DEMO_INVOICE_ID="${invoiceId}"; npx hardhat run deploy/demo_confirm_delivery.ts --network sepolia`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
