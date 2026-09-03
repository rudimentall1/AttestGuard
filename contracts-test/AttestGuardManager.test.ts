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

  it("lets the owner withdraw liquidity that was deposited but never funded out", async function () {
    const { manager, token, owner } = await deployFixture();
    const managerAddress = await manager.getAddress();
    const before = await token.balanceOf(managerAddress);
    expect(before).to.equal(ethers.parseEther("100000"));

    const ownerBalanceBefore = await token.balanceOf(owner.address);
    await manager.withdrawLiquidity(ethers.parseEther("40000"));

    expect(await token.balanceOf(managerAddress)).to.equal(ethers.parseEther("60000"));
    expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore + ethers.parseEther("40000"));
  });

  it("prevents a non-owner from withdrawing liquidity", async function () {
    const { manager, other } = await deployFixture();
    await expect(manager.connect(other).withdrawLiquidity(ethers.parseEther("1"))).to.be.reverted;
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
});
