import "dotenv/config";
import hre from "hardhat";

async function main() {
  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");

  const newOwner = process.env.NEW_OWNER_ADDRESS;
  if (!newOwner) throw new Error("Set NEW_OWNER_ADDRESS (the fresh wallet address) first");
  if (!hre.ethers.isAddress(newOwner)) throw new Error(`NEW_OWNER_ADDRESS "${newOwner}" is not a valid address`);

  const manager = await hre.ethers.getContractAt("AttestGuardManager", managerAddress);

  const currentOwner = await manager.owner();
  const currentGuardian = await manager.guardianConfirmer();
  console.log("Current owner:            ", currentOwner);
  console.log("Current guardianConfirmer:", currentGuardian);
  console.log("Transferring both to:     ", newOwner);

  const tx1 = await manager.setGuardianConfirmer(newOwner);
  await tx1.wait();
  console.log("guardianConfirmer updated. tx:", tx1.hash);

  const tx2 = await manager.transferOwnership(newOwner);
  await tx2.wait();
  console.log("owner transferred. tx:", tx2.hash);

  console.log("\nDone. Verify:");
  console.log("  owner():           ", await manager.owner());
  console.log("  guardianConfirmer():", await manager.guardianConfirmer());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
