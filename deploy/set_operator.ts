import "dotenv/config";
import hre from "hardhat";

// Optional, one-time operational step -- not required for the contract to
// function (operator defaults to the deployer). Run this once you have a
// separate hot key for the always-online worker process, so that a
// compromised worker key cannot withdrawLiquidity/pause/registerAdvance/
// cancelAdvance/setGuardianConfirmer -- it can only call
// recordUnderwritingDecision, a one-shot idempotent write with no funds
// impact. Must be run with the OWNER key (this script calls an onlyOwner
// function), not the new operator key.
async function main() {
  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");

  const newOperator = process.env.NEW_OPERATOR_ADDRESS;
  if (!newOperator) throw new Error("Set NEW_OPERATOR_ADDRESS (the worker process's own address) first");
  if (!hre.ethers.isAddress(newOperator)) {
    throw new Error(`NEW_OPERATOR_ADDRESS "${newOperator}" is not a valid address`);
  }

  const manager = await hre.ethers.getContractAt("AttestGuardManager", managerAddress);

  const currentOwner = await manager.owner();
  const currentOperator = await manager.operator();
  console.log("Current owner:   ", currentOwner);
  console.log("Current operator:", currentOperator);
  console.log("Setting operator to:", newOperator);

  const tx = await manager.setOperator(newOperator);
  await tx.wait();
  console.log("operator updated. tx:", tx.hash);

  console.log("\nDone. Verify:");
  console.log("  owner():   ", await manager.owner());
  console.log("  operator():", await manager.operator());
  console.log(
    "\nIf NEW_OPERATOR_ADDRESS is the worker's CREDITCOIN_WALLET_PRIVATE_KEY address, " +
      "the worker no longer needs the owner key for anything."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});