import { expect } from "chai";
import { ethers } from "hardhat";

const PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000FD2";
const DELIVERY_CONFIRMED_SIGNATURE = ethers.id("DeliveryConfirmed(bytes32,address,address,uint256)");
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function buildEncodedTransaction(opts: {
  from: string;
  to: string;
  receiptStatus: number;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}): string {
  const commonTxChunk = abiCoder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [0n, 21000n, opts.from, false, opts.to, 0n, "0x"]
  );
  const type2Chunk = abiCoder.encode(
    ["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
    [11155111n, 0n, 0n, [], 0, ethers.ZeroHash, ethers.ZeroHash]
  );
  const receiptChunk = abiCoder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [opts.receiptStatus, 21000n, opts.logs.map((l) => [l.address, l.topics, l.data]), "0x"]
  );
  return abiCoder.encode(["uint8", "bytes[]"], [2, [commonTxChunk, type2Chunk, receiptChunk]]);
}

function deliveryLog(source: string, invoiceId: string, buyer: string, supplier: string, amount: bigint) {
  return {
    address: source,
    topics: [DELIVERY_CONFIRMED_SIGNATURE, invoiceId, ethers.zeroPadValue(buyer, 32)],
    data: abiCoder.encode(["address", "uint256"], [supplier, amount]),
  };
}

describe("AttestGuardManager - guardian confirmation hard limit", function () {
  async function deployFixture() {
    const [owner, supplier, buyer, guardian, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DemoAdvanceToken");
    const token = await Token.deploy(owner.address, ethers.parseEther("1000000"));
    const Decoder = await ethers.getContractFactory("EvmV1Decoder");
    const decoder = await Decoder.deploy();
    await decoder.waitForDeployment();
    const Manager = await ethers.getContractFactory("AttestGuardManager", {
      libraries: { EvmV1Decoder: await decoder.getAddress() },
    });
    const manager = await Manager.deploy(
      await token.getAddress(),
      1,
      ethers.parseEther("5000"),
      ethers.parseEther("2000")
    );
    await manager.setGuardianConfirmer(guardian.address);
    await token.approve(await manager.getAddress(), ethers.parseEther("1000000"));
    await manager.depositLiquidity(ethers.parseEther("100000"));
    const sourceConfirmationContract = other.address;
    await manager.registerSourceConfirmationContract(sourceConfirmationContract);
    const Mock = await ethers.getContractFactory("MockNativeQueryVerifier");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    const mockCode = await ethers.provider.getCode(await mock.getAddress());
    await ethers.provider.send("hardhat_setCode", [PRECOMPILE_ADDRESS, mockCode]);
    return { manager, supplier, buyer, guardian, sourceConfirmationContract };
  }

  it("cannot use guardian confirmation to bypass a lowered global hard maximum", async function () {
    const { manager, supplier, buyer, guardian, sourceConfirmationContract } = await deployFixture();
    const invoiceId = ethers.id("confirmation-hard-max");
    const amount = ethers.parseEther("4000");

    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, amount, amount, "WARN: exceeds supplier auto cap");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog(sourceConfirmationContract, invoiceId, buyer.address, supplier.address, amount)],
    });

    await manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, ethers.id("confirmation-hard-max-root"), [], ethers.ZeroHash, []);
    expect((await manager.getAdvance(invoiceId)).status).to.equal(3n);

    await manager.setGlobalMaxAdvance(ethers.parseEther("3000"));

    await expect(manager.connect(guardian).confirmPendingAdvance(invoiceId))
      .to.be.revertedWithCustomError(manager, "AboveGlobalMax");

    expect((await manager.getAdvance(invoiceId)).status).to.equal(3n);
  });
});
