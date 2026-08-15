import "dotenv/config";
import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const TradeConfirmation = await hre.ethers.getContractFactory("TradeConfirmation");
  const tradeConfirmation = await TradeConfirmation.deploy();
  await tradeConfirmation.waitForDeployment();
  const address = await tradeConfirmation.getAddress();

  console.log("\nTradeConfirmation deployed at:", address);
  console.log("Set SOURCE_TRADE_CONFIRMATION_ADDRESS to this address in .env,");
  console.log("then call registerSourceConfirmationContract(this address) on");
  console.log("AttestGuardManager (on Creditcoin) so it only trusts events from here.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
