import "dotenv/config";
import hre from "hardhat";

/**
 * Deploys AttestGuardManager to whatever network hardhat is pointed at
 * (see hardhat.config.ts — `creditcoin_testnet` uses the CC3 testnet RPC by
 * default). Also deploys a TestERC20-style advance token unless
 * ADVANCE_TOKEN_ADDRESS is already set in the environment, so the whole
 * thing can be stood up from zero with no manual steps beyond funding the
 * deployer wallet with testnet CTC for gas.
 *
 * Usage:
 *   npm run deploy:manager
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  let advanceTokenAddress = process.env.ADVANCE_TOKEN_ADDRESS;
  if (!advanceTokenAddress) {
    console.log("No ADVANCE_TOKEN_ADDRESS set — deploying a demo ERC20 for advances...");
    const Token = await hre.ethers.getContractFactory("DemoAdvanceToken");
    const token = await Token.deploy(deployer.address, hre.ethers.parseEther("1000000"));
    await token.waitForDeployment();
    advanceTokenAddress = await token.getAddress();
    console.log("DemoAdvanceToken deployed at:", advanceTokenAddress);
  }

  const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY ?? "1");
  const globalMaxAdvance = hre.ethers.parseEther(process.env.GLOBAL_MAX_ADVANCE ?? "5000");
  const perSupplierDailyCap = hre.ethers.parseEther(process.env.PER_SUPPLIER_DAILY_CAP ?? "2000");

  const Manager = await hre.ethers.getContractFactory("AttestGuardManager");
  const manager = await Manager.deploy(advanceTokenAddress, sourceChainKey, globalMaxAdvance, perSupplierDailyCap);
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();

  console.log("\nAttestGuardManager deployed at:", managerAddress);
  console.log("  advanceToken:        ", advanceTokenAddress);
  console.log("  sourceChainKey:      ", sourceChainKey);
  console.log("  globalMaxAdvance:    ", globalMaxAdvance.toString());
  console.log("  perSupplierDailyCap: ", perSupplierDailyCap.toString());
  console.log("\nSet ATTESTGUARD_MANAGER_ADDRESS to this address before running the off-chain worker.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
