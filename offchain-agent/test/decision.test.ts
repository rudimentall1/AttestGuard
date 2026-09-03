import { test } from "node:test";
import assert from "node:assert/strict";
import { hashUnderwritingDecision } from "../src/decision.js";
import type { UnderwritingProposal } from "../src/types.js";

function proposal(overrides: Partial<UnderwritingProposal> = {}): UnderwritingProposal {
  return {
    proposalVersion: 1,
    invoiceId: "0x" + "11".repeat(32),
    recommendedAdvance: 400n,
    riskTier: "A",
    confidenceBps: 8400,
    reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED", "STRONG_REPAYMENT_HISTORY"],
    riskFlags: [],
    evidenceHash: "0x" + "22".repeat(32),
    modelId: "anthropic",
    modelVersion: "test-model",
    generatedAt: 1_700_000_000,
    ...overrides,
  };
}

test("decision identity is deterministic", () => {
  assert.equal(hashUnderwritingDecision(proposal()), hashUnderwritingDecision(proposal()));
});

test("regeneration time does not change decision identity", () => {
  assert.equal(
    hashUnderwritingDecision(proposal({ generatedAt: 1_700_000_000 })),
    hashUnderwritingDecision(proposal({ generatedAt: 1_800_000_000 }))
  );
});

test("decision identity changes when a security-relevant output changes", () => {
  const first = hashUnderwritingDecision(proposal());
  const variants = [
    proposal({ recommendedAdvance: 350n }),
    proposal({ riskTier: "B" }),
    proposal({ confidenceBps: 7000 }),
    proposal({ evidenceHash: "0x" + "33".repeat(32) }),
    proposal({ modelVersion: "other-model" }),
    proposal({ riskFlags: ["REVIEW_REQUIRED"] }),
    proposal({ reasonCodes: ["DELIVERY_VERIFIED", "PROOF_VERIFIED"] }),
  ];

  for (const variant of variants) {
    assert.notEqual(hashUnderwritingDecision(variant), first);
  }
});

test("reason and flag ordering does not change decision identity", () => {
  const first = hashUnderwritingDecision(proposal());
  const reordered = proposal({
    reasonCodes: ["STRONG_REPAYMENT_HISTORY", "PROOF_VERIFIED", "DELIVERY_VERIFIED"],
    riskFlags: ["B", "A"],
  });
  const baseline = proposal({ riskFlags: ["A", "B"] });
  assert.equal(hashUnderwritingDecision(reordered), hashUnderwritingDecision(baseline));
  assert.notEqual(hashUnderwritingDecision(reordered), first);
});
