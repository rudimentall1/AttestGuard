import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * This is the test the roadmap called out as missing: a full exercise of
 * fundAdvanceFromQuery, not just registration and access control. It works
 * by placing a MockNativeQueryVerifier bytecode directly onto the fixed
 * precompile address (0x0FD2) via hardhat_setCode, since Creditcoin's real
 * Block Prover precompile only exists on an actual Creditcoin node and
 * cannot run inside Hardhat's in-memory EVM.
 *
 * The mock always reports proofs as valid, so what's under test here is
 * everything AttestGuardManager itself is responsible for: decoding the
 * (uint8, bytes[]) transaction/receipt encoding via EvmV1Decoder, matching
 * the DeliveryConfirmed log against the registered invoice, and running
 * the on-chain guardrail policy gate. It does NOT test Attestcoin's own
 * Merkle or continuity proof math - that's Creditcoin's code, not this repo's.
 */

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
    [
      opts.receiptStatus,
      21000n,
      opts.logs.map((l) => [l.address, l.topics, l.data]),
      "0x",
    ]
  );

  return abiCoder.encode(["uint8", "bytes[]"], [2, [commonTxChunk, type2Chunk, receiptChunk]]);
}

function fakeRoot(seed: string): string {
  return ethers.id(seed);
}

function deliveryLog(opts: {
  sourceConfirmationContract: string;
  invoiceId: string;
  buyer: string;
  supplier: string;
  amount?: bigint;
}) {
  return {
    address: opts.sourceConfirmationContract,
    topics: [DELIVERY_CONFIRMED_SIGNATURE, opts.invoiceId, ethers.zeroPadValue(opts.buyer, 32)],
    data: abiCoder.encode(["address", "uint256"], [opts.supplier, opts.amount ?? 0n]),
  };
}

describe("AttestGuardManager - full fundAdvanceFromQuery path (mock precompile)", function () {
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

    return { owner, supplier, buyer, guardian, other, token, manager, sourceConfirmationContract };
  }

  it("flags a brand-new supplier/buyer relationship's first advance for guardian confirmation, even within all caps", async function () {
    // This is the on-chain enforcement of what used to be an off-chain-only,
    // trivially bypassable check (policy.ts's "first advance with this
    // buyer" BLOCK). Anyone calling fundAdvanceFromQuery directly with a
    // valid proof - not just the worker - must hit this gate.
    const { manager, supplier, buyer, sourceConfirmationContract, other } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-first-relationship");
    const invoiceAmount = ethers.parseEther("1000");
    const amount = ethers.parseEther("300"); // well within the 500-ether default auto-approve cap
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "e2e first-relationship case");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    const root = fakeRoot("first-relationship-case");

    // Called by `other`, an address with no special role at all - proving
    // this gate does not depend on who submits the proof.
    const tx = await manager.connect(other).fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, root, [], ethers.ZeroHash, []);
    await expect(tx)
      .to.emit(manager, "AdvanceFlaggedForConfirmation")
      .withArgs(invoiceId, supplier.address, amount, "first advance with this buyer relationship");

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(3n); // PendingConfirmation, NOT auto-funded
  });

  it("auto-funds a second advance for an already-established supplier/buyer relationship, within caps", async function () {
    const { manager, token, supplier, buyer, guardian, sourceConfirmationContract } = await deployFixture();

    // Prime the relationship: first advance always goes to guardian review
    // (see test above), and the guardian confirming it is what
    // "establishes" the relationship on-chain.
    const primeInvoiceId = ethers.id("e2e-invoice-prime");
    const primeAmount = ethers.parseEther("100");
    await manager.registerAdvance(primeInvoiceId, supplier.address, buyer.address, primeAmount, primeAmount, "priming advance");
    const primeTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId: primeInvoiceId, buyer: buyer.address, supplier: supplier.address, amount: primeAmount })],
    });
    await manager.fundAdvanceFromQuery(primeInvoiceId, 1n, primeTx, fakeRoot("prime-case"), [], ethers.ZeroHash, []);
    await manager.connect(guardian).confirmPendingAdvance(primeInvoiceId);
    expect((await manager.getAdvance(primeInvoiceId)).status).to.equal(4n);
    expect(await manager.relationshipFundedCount(ethers.solidityPackedKeccak256(["address", "address"], [supplier.address, buyer.address]))).to.equal(1n);

    const invoiceId = ethers.id("e2e-invoice-auto");
    const invoiceAmount = ethers.parseEther("1000");
    const amount = ethers.parseEther("300");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "e2e happy path");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    const root = fakeRoot("auto-fund-case");
    const supplierBalanceBefore = await token.balanceOf(supplier.address);

    const tx = await manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, root, [], ethers.ZeroHash, []);
    await expect(tx).to.emit(manager, "AdvanceAutoFunded");

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(4n);
    expect(await token.balanceOf(supplier.address)).to.equal(supplierBalanceBefore + amount);
  });

  it("never auto-funds a relationship the owner has marked as defaulted, even within caps, even after prior successful advances", async function () {
    const { manager, supplier, buyer, guardian, sourceConfirmationContract } = await deployFixture();

    // Establish the relationship first (see priming pattern above), so we
    // are proving reportDefault overrides an *established* relationship,
    // not just a first-time one.
    const primeInvoiceId = ethers.id("e2e-invoice-default-prime");
    const primeAmount = ethers.parseEther("100");
    await manager.registerAdvance(primeInvoiceId, supplier.address, buyer.address, primeAmount, primeAmount, "priming advance");
    const primeTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId: primeInvoiceId, buyer: buyer.address, supplier: supplier.address, amount: primeAmount })],
    });
    await manager.fundAdvanceFromQuery(primeInvoiceId, 1n, primeTx, fakeRoot("default-prime-case"), [], ethers.ZeroHash, []);
    await manager.connect(guardian).confirmPendingAdvance(primeInvoiceId);

    await expect(manager.reportDefault(primeInvoiceId, "buyer never repaid within terms"))
      .to.emit(manager, "RelationshipDefaultReported")
      .withArgs(supplier.address, buyer.address, primeInvoiceId, "buyer never repaid within terms");
    expect(await manager.relationshipDefaulted(ethers.solidityPackedKeccak256(["address", "address"], [supplier.address, buyer.address]))).to.equal(true);

    const invoiceId = ethers.id("e2e-invoice-after-default");
    const amount = ethers.parseEther("50"); // trivially within every cap
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, amount, amount, "advance attempted after default");
    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount })],
    });

    const tx = await manager.fundAdvanceFromQuery(invoiceId, 2n, encodedTransaction, fakeRoot("after-default-case"), [], ethers.ZeroHash, []);
    await expect(tx)
      .to.emit(manager, "AdvanceFlaggedForConfirmation")
      .withArgs(invoiceId, supplier.address, amount, "prior default with this buyer relationship");
    expect((await manager.getAdvance(invoiceId)).status).to.equal(3n);
  });

  it("flags an advance for guardian confirmation instead of auto-funding when it exceeds the cap", async function () {
    const { manager, token, supplier, buyer, guardian, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-warn");
    const invoiceAmount = ethers.parseEther("4000");
    const amount = ethers.parseEther("4000");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "e2e warn path");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    const root = fakeRoot("warn-case");
    const tx = await manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, root, [], ethers.ZeroHash, []);
    await expect(tx).to.emit(manager, "AdvanceFlaggedForConfirmation");

    let advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(3n);

    const supplierBalanceBefore = await token.balanceOf(supplier.address);
    await manager.connect(guardian).confirmPendingAdvance(invoiceId);

    advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(4n);
    expect(await token.balanceOf(supplier.address)).to.equal(supplierBalanceBefore + amount);
  });

  it("rejects a proof whose underlying transaction reverted (receiptStatus 0)", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-failed-tx");
    const invoiceAmount = ethers.parseEther("100");
    const amount = ethers.parseEther("50");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "should not fund - underlying tx failed");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 0,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    await expect(
      manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, fakeRoot("failed-tx-case"), [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "TransactionDidNotSucceed");
  });

  it("rejects a proof whose log doesn't match the registered invoiceId/buyer", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-mismatch");
    const invoiceAmount = ethers.parseEther("100");
    const amount = ethers.parseEther("50");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "should not fund - log is for a different invoice");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId: ethers.id("some-other-invoice"), buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    await expect(
      manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, fakeRoot("mismatch-case"), [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "NoMatchingDeliveryEvent");
  });

  it("rejects a DeliveryConfirmed proof whose event supplier is not the registered supplier", async function () {
    const { manager, supplier, buyer, other, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-wrong-supplier");
    const invoiceAmount = ethers.parseEther("100");
    const amount = ethers.parseEther("50");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "supplier binding");

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: other.address, amount: invoiceAmount })],
    });

    await expect(
      manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, fakeRoot("wrong-delivery-supplier-case"), [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "NoMatchingDeliveryEvent");
  });

  it("rejects a DeliveryConfirmed proof whose event amount does not match the registered invoice amount", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-wrong-delivery-amount");
    const invoiceAmount = ethers.parseEther("1000");
    const requestedAdvanceAmount = ethers.parseEther("300");
    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      invoiceAmount,
      requestedAdvanceAmount,
      "delivery amount binding"
    );

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        deliveryLog({
          sourceConfirmationContract,
          invoiceId,
          buyer: buyer.address,
          supplier: supplier.address,
          amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.fundAdvanceFromQuery(
        invoiceId,
        1n,
        encodedTransaction,
        fakeRoot("wrong-delivery-amount-case"),
        [],
        ethers.ZeroHash,
        []
      )
    ).to.be.revertedWithCustomError(manager, "DeliveryAmountMismatch");

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(1n);
  });

  it("enforces replay protection: the same proof cannot fund twice", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixture();

    const invoiceId1 = ethers.id("e2e-invoice-replay-1");
    const invoiceId2 = ethers.id("e2e-invoice-replay-2");
    const invoiceAmount = ethers.parseEther("100");
    const amount = ethers.parseEther("50");
    for (const id of [invoiceId1, invoiceId2]) {
      await manager.registerAdvance(id, supplier.address, buyer.address, invoiceAmount, amount, "replay test");
    }

    const sameRoot = fakeRoot("replay-case");

    const encodedTransaction1 = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId: invoiceId1, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    await manager.fundAdvanceFromQuery(invoiceId1, 1n, encodedTransaction1, sameRoot, [], ethers.ZeroHash, []);

    const encodedTransaction2 = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId: invoiceId2, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    await expect(
      manager.fundAdvanceFromQuery(invoiceId2, 1n, encodedTransaction2, sameRoot, [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "QueryAlreadyProcessed");
  });

  it("respects the Pausable circuit breaker on the real proof-gated path, not just in isolation", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixture();

    const invoiceId = ethers.id("e2e-invoice-paused");
    const invoiceAmount = ethers.parseEther("100");
    const amount = ethers.parseEther("50");
    await manager.registerAdvance(invoiceId, supplier.address, buyer.address, invoiceAmount, amount, "should not fund while paused");

    await manager.pause();

    const encodedTransaction = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [deliveryLog({ sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address, amount: invoiceAmount })],
    });

    await expect(
      manager.fundAdvanceFromQuery(invoiceId, 1n, encodedTransaction, fakeRoot("paused-case"), [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "EnforcedPause");
  });
});
