import "dotenv/config";
import hre from "hardhat";

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

  console.log("Deploying EvmV1Decoder library...");
  const Decoder = await hre.ethers.getContractFactory("EvmV1Decoder");
  const decoder = await Decoder.deploy();
  await decoder.waitForDeployment();
  const decoderAddress = await decoder.getAddress();
  console.log("EvmV1Decoder deployed at:", decoderAddress);

  const Manager = await hre.ethers.getContractFactory("AttestGuardManager", {
    libraries: {
      EvmV1Decoder: decoderAddress,
    },
  });
  const manager = await Manager.deploy(advanceTokenAddress, sourceChainKey, globalMaxAdvance, perSupplierDailyCap);
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();

  console.log("\nAttestGuardManager deployed at:", managerAddress);
  console.log("  EvmV1Decoder library:", decoderAddress);
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
