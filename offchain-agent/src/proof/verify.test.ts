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
    timestamp: "2026-01-01T00:00:00.000Z",
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
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  bundle.ai.authority = "UNSAFE" as never;

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});

test("tampered proof payload fails proofHash verification", () => {
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
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  bundle.decision.reason = "tampered reason";

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});

test("tampered proof hash fails verification", () => {
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
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  bundle.proofHash = "fake-hash";

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});

test("tampering proof data invalidates proof hash", () => {
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
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  bundle.decision.hash = "0xmodified";

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});


test("proof hash is stable regardless of object key order", () => {
  const first = createProofBundle({
    invoiceId: "invoice-001",
    decisionHash: "0xdecision",
    evidenceHash: "0xevidence",
    aiTraceHash: "0xai",
    reportHash: "0xreport",
    policyDecision: "AUTO_APPROVE",
    policyReason: "trusted supplier",
    aiRecommendation: "AUTO_PATH",
    riskTier: "A",
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  const second = {
    version: "1.0" as const,
    schemaVersion: "1.0" as const,
    hashAlgorithm: "SHA256-CANONICAL" as const,
    type: "UNDERWRITING_PROOF" as const,
    invoiceId: "invoice-001",
    decision: {
      reason: "trusted supplier",
      policy: "AUTO_APPROVE",
      hash: "0xdecision",
    },
    ai: {
      authority: "ADVISORY_ONLY" as const,
      traceHash: "0xai",
      recommendation: "AUTO_PATH",
    },
    evidence: {
      riskTier: "A",
      hash: "0xevidence",
    },
    integrity: {
      reportHash: "0xreport",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    proofHash: first.proofHash,
  };

  assert.equal(
    verifyProofBundle(second),
    true
  );
});



test("tampering proof schema metadata invalidates verification", () => {
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
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  bundle.hashAlgorithm = "SHA1" as never;

  assert.equal(
    verifyProofBundle(bundle),
    false
  );
});
