import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Coverage for acknowledgeRepaymentFromQuery - the fix for the gap
 * documented in docs/adr/0005: repayment used to be a plain onlyOwner call
 * with no proof requirement, meaning supplier reputation (autoApproveCap
 * growth) was owner-attested rather than cryptographically verified, unlike
 * funding itself. This suite exists specifically to enforce the invariant
 * stated in the master transformation brief for this session:
 *
 *   supplier credit capacity MUST NOT increase unless repayment has been
 *   independently verified.
 *
 * Same mock-precompile approach as AttestGuardManager.e2e.test.ts - see
 * that file's header comment for why this is necessary and what it does
 * and doesn't prove (Attestcoin's own Merkle/continuity math is Creditcoin's
 * code, not tested here).
 */

const PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000FD2";
const DELIVERY_CONFIRMED_SIGNATURE = ethers.id("DeliveryConfirmed(bytes32,address,address,uint256)");
const REPAYMENT_CONFIRMED_SIGNATURE = ethers.id("RepaymentConfirmed(bytes32,address,address,uint256)");

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

function fakeRoot(seed: string): string {
  return ethers.id(seed);
}

function repaymentLog(opts: {
  sourceConfirmationContract: string;
  invoiceId: string;
  buyer: string;
  supplier: string;
  amount: bigint;
}) {
  return {
    address: opts.sourceConfirmationContract,
    topics: [REPAYMENT_CONFIRMED_SIGNATURE, opts.invoiceId, ethers.zeroPadValue(opts.buyer, 32)],
    data: abiCoder.encode(["address", "uint256"], [opts.supplier, opts.amount]),
  };
}

describe("AttestGuardManager - acknowledgeRepaymentFromQuery (verified repayment)", function () {
  async function deployFixtureWithFundedAdvance() {
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

    const invoiceId = ethers.id("repayment-test-invoice");
    const requestedAdvanceAmount = ethers.parseEther("300");
    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      ethers.parseEther("1000"),
      requestedAdvanceAmount,
      "funded, ready for repayment testing"
    );

    const fundingLog = {
      address: sourceConfirmationContract,
      topics: [DELIVERY_CONFIRMED_SIGNATURE, invoiceId, ethers.zeroPadValue(buyer.address, 32)],
      data: abiCoder.encode(["address", "uint256"], [supplier.address, requestedAdvanceAmount]),
    };
    const fundingTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [fundingLog],
    });
    await manager.fundAdvanceFromQuery(
      invoiceId,
      1n,
      fundingTx,
      fakeRoot("funding-for-repayment-fixture"),
      [],
      ethers.ZeroHash,
      []
    );

    const fundedAdvance = await manager.getAdvance(invoiceId);
    if (fundedAdvance.status !== 4n) {
      throw new Error(`fixture setup failed: expected Funded (4), got ${fundedAdvance.status}`);
    }

    return {
      owner, supplier, buyer, guardian, other,
      token, manager, sourceConfirmationContract,
      invoiceId, requestedAdvanceAmount: requestedAdvanceAmount as bigint,
    };
  }

  it("verifies a real repayment proof, marks the advance Repaid, and raises the supplier's auto-approve cap", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount, other } =
      await deployFixtureWithFundedAdvance();

    const capBefore = await manager.autoApproveCap(supplier.address);

    const repaymentTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract,
          invoiceId,
          buyer: buyer.address,
          supplier: supplier.address,
          amount: requestedAdvanceAmount,
        }),
      ],
    });

    const tx = await manager
      .connect(other)
      .acknowledgeRepaymentFromQuery(
        invoiceId,
        1n,
        repaymentTx,
        fakeRoot("real-repayment-case"),
        [],
        ethers.ZeroHash,
        []
      );
    await expect(tx).to.emit(manager, "RepaymentAcknowledged");
    await expect(tx).to.emit(manager, "AutoApproveCapUpdated");

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(6n);

    const growth = await manager.AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT();
    expect(await manager.autoApproveCap(supplier.address)).to.equal(capBefore + growth);
  });

  it("rejects a repayment proof for an advance that was never funded", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract } = await deployFixtureWithFundedAdvance();

    const neverFundedInvoiceId = ethers.id("never-funded-invoice");
    const repaymentTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract,
          invoiceId: neverFundedInvoiceId,
          buyer: buyer.address,
          supplier: supplier.address,
          amount: ethers.parseEther("300"),
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        neverFundedInvoiceId, 1n, repaymentTx, fakeRoot("never-funded-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "UnknownAdvance");
  });

  it("rejects a repayment proof that covers less than the amount actually advanced", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const shortRepaymentTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract,
          invoiceId,
          buyer: buyer.address,
          supplier: supplier.address,
          amount: requestedAdvanceAmount - ethers.parseEther("1"),
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, shortRepaymentTx, fakeRoot("short-repayment-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "RepaymentAmountTooLow");

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(4n);
  });

  it("accepts a repayment that covers exactly the advanced amount (boundary, not just strictly more)", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const exactRepaymentTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract, invoiceId, buyer: buyer.address, supplier: supplier.address,
          amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, exactRepaymentTx, fakeRoot("exact-repayment-case"), [], ethers.ZeroHash, []
      )
    ).to.not.be.reverted;
  });

  it("rejects a repayment proof whose log doesn't match this invoice's buyer", async function () {
    const { manager, supplier, buyer, other, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const wrongBuyerTx = buildEncodedTransaction({
      from: other.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract, invoiceId, buyer: other.address,
          supplier: supplier.address, amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, wrongBuyerTx, fakeRoot("wrong-buyer-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "NoMatchingRepaymentEvent");
  });

  it("rejects a repayment proof whose event supplier is not the registered supplier", async function () {
    const { manager, supplier, buyer, other, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const capBefore = await manager.autoApproveCap(supplier.address);
    const wrongSupplierTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract,
          invoiceId,
          buyer: buyer.address,
          supplier: other.address,
          amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 3n, wrongSupplierTx, fakeRoot("wrong-repayment-supplier-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "NoMatchingRepaymentEvent");

    expect(await manager.autoApproveCap(supplier.address)).to.equal(capBefore);
    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(4n);
  });

  it("rejects a proof whose underlying transaction reverted", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const failedTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 0,
      logs: [
        repaymentLog({
          sourceConfirmationContract, invoiceId, buyer: buyer.address,
          supplier: supplier.address, amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, failedTx, fakeRoot("failed-repayment-tx-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "TransactionDidNotSucceed");
  });

  it("rejects a DeliveryConfirmed-shaped log as a repayment proof - the two event signatures must not be confusable", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId } = await deployFixtureWithFundedAdvance();

    const deliveryShapedTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        {
          address: sourceConfirmationContract,
          topics: [DELIVERY_CONFIRMED_SIGNATURE, invoiceId, ethers.zeroPadValue(buyer.address, 32)],
          data: "0x",
        },
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, deliveryShapedTx, fakeRoot("signature-confusion-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "NoMatchingRepaymentEvent");
  });

  it("enforces replay protection: the same proof root cannot acknowledge repayment for two different invoices", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const invoiceId2 = ethers.id("repayment-test-invoice-replay-2");
    await manager.registerAdvance(
      invoiceId2, supplier.address, buyer.address, ethers.parseEther("1000"),
      requestedAdvanceAmount, "second advance for same-root replay test"
    );
    const fundingTx2 = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [{
        address: sourceConfirmationContract,
        topics: [DELIVERY_CONFIRMED_SIGNATURE, invoiceId2, ethers.zeroPadValue(buyer.address, 32)],
        data: abiCoder.encode(["address", "uint256"], [supplier.address, requestedAdvanceAmount]),
      }],
    });
    await manager.fundAdvanceFromQuery(
      invoiceId2, 9n, fundingTx2, fakeRoot("funding-root-for-invoice2"), [], ethers.ZeroHash, []
    );

    const root = fakeRoot("replay-repayment-case");
    const repaymentTx1 = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [repaymentLog({
        sourceConfirmationContract, invoiceId, buyer: buyer.address,
        supplier: supplier.address, amount: requestedAdvanceAmount,
      })],
    });
    await manager.acknowledgeRepaymentFromQuery(invoiceId, 1n, repaymentTx1, root, [], ethers.ZeroHash, []);

    const repaymentTx2 = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [repaymentLog({
        sourceConfirmationContract, invoiceId: invoiceId2, buyer: buyer.address,
        supplier: supplier.address, amount: requestedAdvanceAmount,
      })],
    });
    await expect(
      manager.acknowledgeRepaymentFromQuery(invoiceId2, 1n, repaymentTx2, root, [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "QueryAlreadyProcessed");
  });

  it("cannot be replayed against a second invoice either, even reusing the same proof root", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const invoiceId2 = ethers.id("repayment-test-invoice-2");
    await manager.registerAdvance(
      invoiceId2, supplier.address, buyer.address, ethers.parseEther("1000"),
      requestedAdvanceAmount, "second advance for replay-across-invoices test"
    );
    const fundingTx2 = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [{
        address: sourceConfirmationContract,
        topics: [DELIVERY_CONFIRMED_SIGNATURE, invoiceId2, ethers.zeroPadValue(buyer.address, 32)],
        data: abiCoder.encode(["address", "uint256"], [supplier.address, requestedAdvanceAmount]),
      }],
    });
    const sameRoot = fakeRoot("cross-invoice-replay-root");
    await manager.fundAdvanceFromQuery(invoiceId2, 2n, fundingTx2, sameRoot, [], ethers.ZeroHash, []);

    const repaymentTx = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [repaymentLog({
        sourceConfirmationContract, invoiceId, buyer: buyer.address,
        supplier: supplier.address, amount: requestedAdvanceAmount,
      })],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(invoiceId, 2n, repaymentTx, sameRoot, [], ethers.ZeroHash, [])
    ).to.be.revertedWithCustomError(manager, "QueryAlreadyProcessed");
  });

  it("respects the Pausable circuit breaker on the repayment path too", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    await manager.pause();

    const repaymentTx = buildEncodedTransaction({
      from: buyer.address,
      to: sourceConfirmationContract,
      receiptStatus: 1,
      logs: [
        repaymentLog({
          sourceConfirmationContract, invoiceId, buyer: buyer.address,
          supplier: supplier.address, amount: requestedAdvanceAmount,
        }),
      ],
    });

    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 1n, repaymentTx, fakeRoot("paused-repayment-case"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "EnforcedPause");
  });

  it("cannot mark an already-Repaid advance as repaid a second time via a fresh proof", async function () {
    const { manager, supplier, buyer, sourceConfirmationContract, invoiceId, requestedAdvanceAmount } =
      await deployFixtureWithFundedAdvance();

    const firstRepaymentTx = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [repaymentLog({
        sourceConfirmationContract, invoiceId, buyer: buyer.address,
        supplier: supplier.address, amount: requestedAdvanceAmount,
      })],
    });
    await manager.acknowledgeRepaymentFromQuery(
      invoiceId, 1n, firstRepaymentTx, fakeRoot("first-legit-repayment"), [], ethers.ZeroHash, []
    );

    const secondRepaymentTx = buildEncodedTransaction({
      from: buyer.address, to: sourceConfirmationContract, receiptStatus: 1,
      logs: [repaymentLog({
        sourceConfirmationContract, invoiceId, buyer: buyer.address,
        supplier: supplier.address, amount: requestedAdvanceAmount,
      })],
    });
    await expect(
      manager.acknowledgeRepaymentFromQuery(
        invoiceId, 5n, secondRepaymentTx, fakeRoot("second-distinct-proof-same-invoice"), [], ethers.ZeroHash, []
      )
    ).to.be.revertedWithCustomError(manager, "UnknownAdvance");
  });
});
