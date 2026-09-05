import assert from "node:assert/strict";
import test from "node:test";

import { createEnvelope } from "./envelope-builder.js";
import { signEnvelope } from "./envelope-sign.js";
import { loadVerifiedEnvelope } from "./envelope-loader.js";
import { createProofBundle } from "./proof-bundle.js";


const proof = createProofBundle({
  invoiceId: "invoice-001",
  decisionHash: "0xdecision",
  evidenceHash: "0xevidence",
  aiTraceHash: "0xai",
  reportHash: "0xreport",
  policyDecision: "AUTO_APPROVE",
  policyReason: "trusted supplier",
  aiRecommendation: "AUTO_PATH",
  riskTier: "A",
  timestamp: "2026-01-01T00:00:00.000Z"
});

test("verified envelope loader accepts valid signed envelope", () => {

  const envelope = createEnvelope(
    proof,
    "issuer-test"
  );

  const signed = signEnvelope(
    envelope,
    "issuer-test"
  );


  const result =
    loadVerifiedEnvelope(signed);


  assert.equal(
    result.issuer,
    "issuer-test"
  );
});


test("verified envelope loader rejects invalid signature", () => {

  const envelope = createEnvelope(
    proof,
    "issuer-test"
  );


  assert.throws(() =>
    loadVerifiedEnvelope(envelope)
  );

});

