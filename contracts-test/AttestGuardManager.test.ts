import { expect } from "chai";
import { ethers } from "hardhat";

describe("AttestGuardManager", function () {
  async function deployFixture() {
    const [owner, supplier, buyer, guardian, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("DemoAdvanceToken");
    const token = await Token.deploy(owner.address, ethers.parseEther("1000000"));

    const Decoder = await ethers.getContractFactory("EvmV1Decoder");
    const decoder = await Decoder.deploy();
    await decoder.waitForDeployment();

    const Manager = await ethers.getContractFactory("AttestGuardManager", {
      libraries: {
        EvmV1Decoder: await decoder.getAddress(),
      },
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

    return { owner, supplier, buyer, guardian, other, token, manager };
  }

  async function registerDefaultAdvance(manager: any, supplier: any, buyer: any, name = "invoice") {
    const invoiceId = ethers.id(name);
    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      ethers.parseEther("1000"),
      ethers.parseEther("400"),
      "clean history, well within cap"
    );
    return invoiceId;
  }

  it("registers an advance in the Registered state", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = ethers.id("invoice-1");

    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      ethers.parseEther("1000"),
      ethers.parseEther("400"),
      "clean history, well within cap"
    );

    const advance = await manager.getAdvance(invoiceId);
    expect(advance.status).to.equal(1n);
    expect(advance.requestedAdvanceAmount).to.equal(ethers.parseEther("400"));
  });

  it("rejects registering an advance larger than the invoice face value", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = ethers.id("invoice-bad");

    await expect(
      manager.registerAdvance(
        invoiceId,
        supplier.address,
        buyer.address,
        ethers.parseEther("100"),
        ethers.parseEther("500"),
        "n/a"
      )
    ).to.be.revertedWith("Advance cannot exceed invoice amount");
  });

  it("gives every new supplier the same starting auto-approve cap", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = ethers.id("invoice-cap-check");

    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      ethers.parseEther("1000"),
      ethers.parseEther("400"),
      "n/a"
    );

    expect(await manager.autoApproveCap(supplier.address)).to.equal(await manager.DEFAULT_AUTO_APPROVE_CAP());
  });

  it("only allows the designated guardian to confirm a WARN-tier advance", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    const invoiceId = ethers.id("invoice-warn");

    await manager.registerAdvance(
      invoiceId,
      supplier.address,
      buyer.address,
      ethers.parseEther("4000"),
      ethers.parseEther("4000"),
      "large first-time advance, flagged for review"
    );

    await expect(manager.connect(other).confirmPendingAdvance(invoiceId)).to.be.reverted;
  });

  it("lets the owner set a new global max advance", async function () {
    const { manager } = await deployFixture();
    await manager.setGlobalMaxAdvance(ethers.parseEther("9999"));
    expect(await manager.globalMaxAdvance()).to.equal(ethers.parseEther("9999"));
  });

  it("prevents a non-owner from changing policy caps", async function () {
    const { manager, other } = await deployFixture();
    await expect(manager.connect(other).setGlobalMaxAdvance(ethers.parseEther("1"))).to.be.reverted;
  });

  it("lets a depositor withdraw their own shares, proportional to the vault's balance, when it was never funded out", async function () {
    const { manager, token, owner } = await deployFixture();
    const managerAddress = await manager.getAddress();
    const before = await token.balanceOf(managerAddress);
    expect(before).to.equal(ethers.parseEther("100000"));

    // deployFixture's owner deposit was the first-ever deposit, so shares == amount (100000).
    expect(await manager.sharesOf(owner.address)).to.equal(ethers.parseEther("100000"));

    const ownerBalanceBefore = await token.balanceOf(owner.address);
    await expect(manager.withdrawLiquidity(ethers.parseEther("40000")))
      .to.emit(manager, "LiquidityWithdrawn")
      .withArgs(owner.address, ethers.parseEther("40000"));

    expect(await token.balanceOf(managerAddress)).to.equal(ethers.parseEther("60000"));
    expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore + ethers.parseEther("40000"));
    expect(await manager.sharesOf(owner.address)).to.equal(ethers.parseEther("60000"));
  });

  it("lets any depositor withdraw their own shares, not just the owner", async function () {
    const { manager, token, other } = await deployFixture();
    await token.transfer(other.address, ethers.parseEther("500"));
    await token.connect(other).approve(await manager.getAddress(), ethers.parseEther("500"));
    await manager.connect(other).depositLiquidity(ethers.parseEther("500"));

    const balanceBefore = await token.balanceOf(other.address);
    await manager.connect(other).withdrawLiquidity(await manager.sharesOf(other.address));
    expect(await token.balanceOf(other.address)).to.be.greaterThanOrEqual(balanceBefore);
  });

  it("prevents withdrawing more shares than you own", async function () {
    const { manager, other } = await deployFixture();
    await expect(manager.connect(other).withdrawLiquidity(ethers.parseEther("1"))).to.be.revertedWithCustomError(
      manager,
      "InsufficientShares"
    );
  });

  it("prevents withdrawing liquidity that's reserved for a registered advance, even if the owner holds enough shares", async function () {
    const { manager, supplier, buyer, owner } = await deployFixture();
    // deployFixture deposited 100000 ether; register an advance close to that so withdrawing
    // most of it would dip below what's reserved for this still-unfunded advance.
    await manager.registerAdvance(
      ethers.id("reserve-check-invoice"),
      supplier.address,
      buyer.address,
      ethers.parseEther("90000"),
      ethers.parseEther("90000"),
      "large advance reserving most of the vault"
    );
    expect(await manager.reservedForPending()).to.equal(ethers.parseEther("90000"));
    expect(await manager.availableLiquidity()).to.equal(ethers.parseEther("10000"));

    // Owner holds all 100000 shares and could try to withdraw all of it -- must be blocked
    // from taking the balance below the 90000 reserved for the pending advance.
    await expect(
      manager.connect(owner).withdrawLiquidity(ethers.parseEther("100000"))
    ).to.be.revertedWithCustomError(manager, "InsufficientAvailableLiquidity");

    // Withdrawing only the genuinely-available portion still works.
    await manager.connect(owner).withdrawLiquidity(ethers.parseEther("10000"));
  });

  it("records one underwriting decision hash against a registered invoice", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "decision-record");
    const decisionHash = ethers.id("decision-v1");

    await expect(manager.recordUnderwritingDecision(invoiceId, decisionHash))
      .to.emit(manager, "UnderwritingDecisionRecorded")
      .withArgs(invoiceId, decisionHash);

    expect(await manager.underwritingDecisionHash(invoiceId)).to.equal(decisionHash);
    expect((await manager.getAdvance(invoiceId)).status).to.equal(1n);
  });

  it("rejects an empty underwriting decision hash", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "decision-empty");

    await expect(manager.recordUnderwritingDecision(invoiceId, ethers.ZeroHash))
      .to.be.revertedWith("Empty decision hash");
  });

  it("rejects recording the underwriting decision twice", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "decision-replay");
    const firstHash = ethers.id("decision-first");
    const secondHash = ethers.id("decision-second");

    await manager.recordUnderwritingDecision(invoiceId, firstHash);
    await expect(manager.recordUnderwritingDecision(invoiceId, secondHash))
      .to.be.revertedWith("Decision already recorded");
    expect(await manager.underwritingDecisionHash(invoiceId)).to.equal(firstHash);
  });

  it("rejects underwriting decision recording from a non-owner", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "decision-owner");

    await expect(manager.connect(other).recordUnderwritingDecision(invoiceId, ethers.id("decision")))
      .to.be.reverted;
  });

  it("lets a separately-set operator record a decision without holding owner privileges", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "operator-decision");

    await expect(manager.setOperator(other.address))
      .to.emit(manager, "OperatorUpdated")
      .withArgs(other.address);

    await expect(manager.connect(other).recordUnderwritingDecision(invoiceId, ethers.id("decision-op")))
      .to.emit(manager, "UnderwritingDecisionRecorded")
      .withArgs(invoiceId, ethers.id("decision-op"));

    // The operator still cannot do anything an owner-only function guards --
    // e.g. withdrawing liquidity -- confirming this is a narrow delegation,
    // not a second owner.
    await expect(manager.connect(other).withdrawLiquidity(1))
      .to.be.reverted;
  });

  it("rejects recording from an account that is neither owner nor the current operator", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "operator-decision-2");

    // other is not the operator (default operator is the deployer) and not
    // the owner, so this must revert.
    await expect(
      manager.connect(other).recordUnderwritingDecision(invoiceId, ethers.id("decision-op-2"))
    ).to.be.revertedWithCustomError(manager, "NotOperator");
  });

  it("prevents a non-owner from changing the operator", async function () {
    const { manager, other } = await deployFixture();
    await expect(
      manager.connect(other).setOperator(other.address)
    ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
  });

  it("rejects underwriting decision recording for an unknown invoice", async function () {
    const { manager } = await deployFixture();
    await expect(manager.recordUnderwritingDecision(ethers.id("unknown"), ethers.id("decision")))
      .to.be.revertedWithCustomError(manager, "AdvanceNotPending");
  });

  it("keeps the recorded decision hash independent from deterministic policy caps", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "decision-policy");
    const decisionHash = ethers.id("permissive-ai-decision");

    await manager.recordUnderwritingDecision(invoiceId, decisionHash);
    await manager.setGlobalMaxAdvance(ethers.parseEther("300"));

    expect(await manager.underwritingDecisionHash(invoiceId)).to.equal(decisionHash);
    expect(await manager.globalMaxAdvance()).to.equal(ethers.parseEther("300"));
  });

  it("blocks fundAdvanceFromQuery-path functions while paused, without blocking registration", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    await manager.pause();

    const invoiceId = ethers.id("invoice-while-paused");
    await expect(
      manager.registerAdvance(
        invoiceId,
        supplier.address,
        buyer.address,
        ethers.parseEther("100"),
        ethers.parseEther("50"),
        "registered while paused, should still succeed"
      )
    ).to.not.be.reverted;

    await expect(manager.connect(other).confirmPendingAdvance(invoiceId)).to.be.reverted;
  });

  it("lets the owner unpause and resume normal operation", async function () {
    const { manager } = await deployFixture();
    await manager.pause();
    expect(await manager.paused()).to.equal(true);
    await manager.unpause();
    expect(await manager.paused()).to.equal(false);
  });

  it("prevents a non-owner from pausing or unpausing", async function () {
    const { manager, other } = await deployFixture();
    await expect(manager.connect(other).pause()).to.be.reverted;
  });

  it("owner can cancel a stuck Registered advance", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "cancel-me");

    const [owner] = await ethers.getSigners();
    await expect(manager.cancelAdvance(invoiceId, "source-chain amount will never match"))
      .to.emit(manager, "AdvanceCancelled")
      .withArgs(invoiceId, owner.address, "source-chain amount will never match");

    const advance = await manager.advances(invoiceId);
    expect(advance.status).to.equal(7); // Cancelled
  });

  it("prevents a non-owner from cancelling an advance", async function () {
    const { manager, supplier, buyer, other } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "cancel-me-2");

    await expect(
      manager.connect(other).cancelAdvance(invoiceId, "not my call")
    ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
  });

  it("cannot cancel an advance that already left Registered status", async function () {
    const { manager, supplier, buyer } = await deployFixture();
    const invoiceId = await registerDefaultAdvance(manager, supplier, buyer, "cancel-me-3");

    await manager.cancelAdvance(invoiceId, "first cancel");
    await expect(
      manager.cancelAdvance(invoiceId, "second cancel should fail")
    ).to.be.revertedWithCustomError(manager, "AdvanceNotPending");
  });
});