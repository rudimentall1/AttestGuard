import test from "node:test";
import assert from "node:assert/strict";

import { createProofBundle } from "./proof-bundle.js";
import { verifyProofBundle } from "./verify.js";

test("valid proof bundle passes verification", () => {
  const bundle = createProofBundle({
    invoiceId: "invoice-001",
    decisionHash: "0xdecision",
    evidenceHash: "0xevidence",
    aiTraceHash: "0xai",
    reportHash: "0xreport",
    policyDecision: "AUTO_APPROVE",
    policyReason: "trusted supplier",
    aiRecommendation: "AUTO_PATH",
    riskTier: "A",
  });

  assert.equal(
    verifyProofBundle(bundle),
    true
  );
});


test("tampered proof bundle fails verification", () => {
  const bundle = createProofBundle({
    invoiceId: "invoice-001",
    decisionHash: "0xdecision",
    evidenceHash: "0xevidence",
    aiTraceHash: "0xai",
    reportHash: "0xreport",
    policyDecision: "AUTO_APPROVE",
    policyReason: "trusted supplier",
    aiRecommendation: "AUTO_PATH",
    riskTier: "A",
  });

  bundle.ai.authority = "UNSAFE" as never;

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});