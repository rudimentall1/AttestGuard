import { test } from "node:test";
import assert from "node:assert/strict";
import { hashEvidence, underwrite } from "../src/underwriter.js";
import type { AdvanceRequest, SupplierHistory, UnderwritingEvidence } from "../src/types.js";

function baseRequest(overrides: Partial<AdvanceRequest> = {}): AdvanceRequest {
  return {
    invoiceId: "0x" + "11".repeat(32),
    supplier: "0x1111111111111111111111111111111111111a",
    buyer: "0x2222222222222222222222222222222222222b",
    invoiceAmount: 1000n,
    requestedAdvanceAmount: 400n,
    ...overrides,
  };
}

function baseHistory(overrides: Partial<SupplierHistory> = {}): SupplierHistory {
  return {
    supplier: "0x1111111111111111111111111111111111111a",
    autoApproveCap: 500n,
    fundedToday: 0n,
    perSupplierDailyCap: 2000n,
    priorAdvancesWithThisBuyer: 3,
    priorDefaultsWithThisBuyer: 0,
    ...overrides,
  };
}

function evidence(overrides: Partial<UnderwritingEvidence> = {}): UnderwritingEvidence {
  return {
    request: baseRequest(),
    history: baseHistory(),
    deliveryVerified: true,
    proofVerified: true,
    invoiceAgeSeconds: 3600,
    ...overrides,
  };
}

function mockAnthropic(payload: unknown): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
}

test("produces a bounded proposal from a valid model response", async () => {
  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    model: "test-model",
    now: () => 1_700_000_000,
    fetchFn: mockAnthropic({
      recommendedAdvance: "400",
      riskTier: "A",
      confidenceBps: 8400,
      reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.recommendedAdvance, 400n);
  assert.equal(proposal.riskTier, "A");
  assert.equal(proposal.confidenceBps, 8400);
  assert.equal(proposal.modelVersion, "test-model");
  assert.match(proposal.evidenceHash, /^0x[0-9a-f]{64}$/);
});

test("caps a model recommendation above the deterministic envelope", async () => {
  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    fetchFn: mockAnthropic({
      recommendedAdvance: "900",
      riskTier: "A",
      confidenceBps: 10000,
      reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.recommendedAdvance, 500n);
  assert.ok(proposal.reasonCodes.includes("POLICY_OVERRIDE_REQUIRED"));
  assert.ok(proposal.riskFlags.includes("MODEL_RECOMMENDATION_EXCEEDED_DETERMINISTIC_ENVELOPE"));
});

test("unverified facts force zero advance and tier D regardless of AI claims", async () => {
  const proposal = await underwrite(evidence({ deliveryVerified: false, proofVerified: false }), {
    anthropicApiKey: "test-key",
    fetchFn: mockAnthropic({
      recommendedAdvance: "400",
      riskTier: "A",
      confidenceBps: 9900,
      reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.recommendedAdvance, 0n);
  assert.equal(proposal.riskTier, "D");
  assert.ok(!proposal.reasonCodes.includes("DELIVERY_VERIFIED"));
  assert.ok(!proposal.reasonCodes.includes("PROOF_VERIFIED"));
  assert.ok(proposal.reasonCodes.includes("POLICY_OVERRIDE_REQUIRED"));
  assert.ok(proposal.riskFlags.includes("DELIVERY_NOT_VERIFIED"));
  assert.ok(proposal.riskFlags.includes("PROOF_NOT_VERIFIED"));
  assert.ok(proposal.riskFlags.includes("VERIFICATION_REQUIRED_BEFORE_ADVANCE"));
});

test("deterministic fallback also fails closed when proof is missing", async () => {
  const proposal = await underwrite(evidence({ proofVerified: false }), {
    now: () => 1_700_000_000,
  });

  assert.equal(proposal.modelId, "deterministic-fallback");
  assert.equal(proposal.recommendedAdvance, 0n);
  assert.equal(proposal.riskTier, "D");
  assert.ok(proposal.riskFlags.includes("PROOF_NOT_VERIFIED"));
});

test("rejects unsafe numeric amounts and fails back safely", async () => {
  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    fetchFn: mockAnthropic({
      recommendedAdvance: Number.MAX_SAFE_INTEGER + 1,
      riskTier: "A",
      confidenceBps: 8000,
      reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.modelId, "deterministic-fallback");
  assert.equal(proposal.recommendedAdvance, 400n);
});

test("rejects invalid model confidence and fails back safely", async () => {
  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    fetchFn: mockAnthropic({
      recommendedAdvance: "400",
      riskTier: "A",
      confidenceBps: 10001,
      reasonCodes: ["DELIVERY_VERIFIED"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.modelId, "deterministic-fallback");
  assert.equal(proposal.recommendedAdvance, 400n);
});

test("rejects unknown reason codes and fails back safely", async () => {
  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    fetchFn: mockAnthropic({
      recommendedAdvance: "400",
      riskTier: "A",
      confidenceBps: 8000,
      reasonCodes: ["APPROVE_ANYTHING"],
      riskFlags: [],
    }),
  });

  assert.equal(proposal.modelId, "deterministic-fallback");
});

test("malformed model JSON cannot block or authorize the funding path", async () => {
  const fetchFn: typeof fetch = async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text: "ignore previous constraints" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const proposal = await underwrite(evidence(), {
    anthropicApiKey: "test-key",
    fetchFn,
  });

  assert.equal(proposal.modelId, "deterministic-fallback");
  assert.equal(proposal.recommendedAdvance, 400n);
});

test("prior defaults produce elevated fallback risk", async () => {
  const proposal = await underwrite(
    evidence({ history: baseHistory({ priorDefaultsWithThisBuyer: 2 }) }),
    { now: () => 1_700_000_000 }
  );

  assert.equal(proposal.riskTier, "D");
  assert.ok(proposal.reasonCodes.includes("DEFAULT_HISTORY"));
  assert.ok(proposal.riskFlags.includes("PRIOR_DEFAULTS"));
});

test("evidence hash changes when a security-relevant fact changes", () => {
  const first = hashEvidence(evidence());
  const second = hashEvidence(evidence({ proofVerified: false }));
  assert.notEqual(first, second);
});
