import { test } from "node:test";
import assert from "node:assert/strict";
import { routeReview } from "../src/routing.js";
import type { AdvanceRequest, PolicyDecision, UnderwritingProposal } from "../src/types.js";

const request: AdvanceRequest = {
  invoiceId: "0x" + "11".repeat(32),
  supplier: "0x1111111111111111111111111111111111111a",
  buyer: "0x2222222222222222222222222222222222222b",
  invoiceAmount: 1000n,
  requestedAdvanceAmount: 400n,
};

function proposal(overrides: Partial<UnderwritingProposal> = {}): UnderwritingProposal {
  return {
    proposalVersion: 1,
    invoiceId: request.invoiceId,
    recommendedAdvance: 400n,
    riskTier: "A",
    confidenceBps: 9000,
    reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"],
    riskFlags: [],
    evidenceHash: "0x" + "22".repeat(32),
    modelId: "test",
    modelVersion: "v1",
    generatedAt: 1_700_000_000,
    ...overrides,
  };
}

const auto: PolicyDecision = { verdict: "AUTO_APPROVE", reason: "within deterministic caps" };
const warn: PolicyDecision = { verdict: "WARN", reason: "guardian confirmation required" };
const block: PolicyDecision = { verdict: "BLOCK", reason: "invalid amount" };

test("policy BLOCK cannot be downgraded by low-risk AI", () => {
  assert.equal(routeReview(request, block, proposal({ riskTier: "A", confidenceBps: 10000 })).route, "BLOCKED_BY_POLICY");
});

test("policy WARN cannot be downgraded by low-risk AI", () => {
  assert.equal(routeReview(request, warn, proposal({ riskTier: "A", confidenceBps: 10000 })).route, "ONCHAIN_GUARDIAN_REVIEW");
});

test("routine policy AUTO plus clean tier A stays on auto path", () => {
  assert.equal(routeReview(request, auto, proposal()).route, "AUTO_PATH");
});

test("AI tier C escalates an otherwise-auto request to review attention", () => {
  assert.equal(routeReview(request, auto, proposal({ riskTier: "C" })).route, "AI_REVIEW_RECOMMENDED");
});

test("AI tier D escalates but does not become a deterministic policy block", () => {
  assert.equal(routeReview(request, auto, proposal({ riskTier: "D" })).route, "AI_REVIEW_RECOMMENDED");
});

test("reduced AI recommendation escalates an otherwise-auto request", () => {
  assert.equal(routeReview(request, auto, proposal({ recommendedAdvance: 250n })).route, "AI_REVIEW_RECOMMENDED");
});

test("policy override signal escalates even with low risk tier", () => {
  assert.equal(
    routeReview(request, auto, proposal({ reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED", "POLICY_OVERRIDE_REQUIRED"] })).route,
    "AI_REVIEW_RECOMMENDED"
  );
});

test("AI confidence alone never overrides deterministic policy", () => {
  assert.equal(routeReview(request, warn, proposal({ confidenceBps: 10000 })).route, "ONCHAIN_GUARDIAN_REVIEW");
  assert.equal(routeReview(request, block, proposal({ confidenceBps: 10000 })).route, "BLOCKED_BY_POLICY");
});
