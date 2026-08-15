import "dotenv/config";
import hre from "hardhat";

async function main() {
  const managerAddress = process.env.ATTESTGUARD_MANAGER_ADDRESS;
  const sourceContractAddress = process.env.SOURCE_TRADE_CONFIRMATION_ADDRESS;
  const advanceTokenAddress = process.env.ADVANCE_TOKEN_ADDRESS;

  if (!managerAddress) throw new Error("Set ATTESTGUARD_MANAGER_ADDRESS in .env first");
  if (!sourceContractAddress) throw new Error("Set SOURCE_TRADE_CONFIRMATION_ADDRESS in .env first");

  const manager = await hre.ethers.getContractAt("AttestGuardManager", managerAddress);

  console.log(`Registering source confirmation contract ${sourceContractAddress}...`);
  const tx1 = await manager.registerSourceConfirmationContract(sourceContractAddress);
  await tx1.wait();
  console.log("Registered. sourceConfirmationContract is now:", await manager.sourceConfirmationContract());

  const tokenAddress = advanceTokenAddress ?? (await manager.ADVANCE_TOKEN());
  const token = await hre.ethers.getContractAt("DemoAdvanceToken", tokenAddress);
  const depositAmount = hre.ethers.parseEther(process.env.INITIAL_VAULT_DEPOSIT ?? "10000");

  console.log(`Approving + depositing ${depositAmount.toString()} of ${tokenAddress} into the vault...`);
  const tx2 = await token.approve(managerAddress, depositAmount);
  await tx2.wait();
  const tx3 = await manager.depositLiquidity(depositAmount);
  await tx3.wait();

  const vaultBalance = await token.balanceOf(managerAddress);
  console.log("Vault balance is now:", vaultBalance.toString());
  console.log("\nSetup complete. The manager is ready to receive fundAdvanceFromQuery calls from the worker.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
