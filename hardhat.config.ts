import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";

const DEPLOYER_KEY = process.env.CREDITCOIN_WALLET_PRIVATE_KEY || "0x" + "11".repeat(32);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts-test",
  },
  networks: {
    hardhat: {},
    creditcoin_testnet: {
      url: process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network",
      accounts: [DEPLOYER_KEY],
    },
    sepolia: {
      url: process.env.SOURCE_CHAIN_RPC_URL || "https://sepolia.infura.io/v3/",
      accounts: [DEPLOYER_KEY],
    },
  },
};

export default config;
