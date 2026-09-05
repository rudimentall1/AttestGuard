import assert from "node:assert/strict";
import test from "node:test";

import { createProofBundle } from "./proof-bundle.js";
import { createEnvelope } from "./envelope-builder.js";
import { signEnvelope } from "./envelope-sign.js";
import { verifyAttestGuardEnvelope } from "./attestguard-verify.js";


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


test("public verifier accepts valid signed envelope", () => {

  const envelope =
    createEnvelope(
      proof,
      "issuer-test"
    );


  const signed =
    signEnvelope(
      envelope,
      "issuer-test"
    );


  const result =
    verifyAttestGuardEnvelope(
      signed
    );


  assert.equal(
    result.valid,
    true
  );


  assert.equal(
    result.issuer,
    "issuer-test"
  );


  assert.equal(
    result.proofHash,
    proof.proofHash
  );

});


test("public verifier rejects invalid envelope", () => {

  const envelope =
    createEnvelope(
      proof,
      "issuer-test"
    );


  const result =
    verifyAttestGuardEnvelope(
      envelope
    );


  assert.equal(
    result.valid,
    false
  );

});
