import test from "node:test";
import assert from "node:assert/strict";

import { createEnvelope } from "./envelope-builder.js";
import { signEnvelope } from "./envelope-sign.js";
import { verifyEnvelopeSignature } from "./envelope-sign-verify.js";


function sampleEnvelope() {

  return createEnvelope(
    {
      version: "1.0",
      schemaVersion: "1.0",
      hashAlgorithm: "SHA256-CANONICAL",
      type: "UNDERWRITING_PROOF",

      invoiceId: "invoice-001",

      decision: {
        hash: "0xdecision",
        policy: "AUTO_APPROVE",
        reason: "trusted supplier"
      },

      ai: {
        authority: "ADVISORY_ONLY",
        traceHash: "0xai",
        recommendation: "AUTO_PATH"
      },

      evidence: {
        riskTier: "A",
        hash: "0xevidence"
      },

      integrity: {
        reportHash: "0xreport"
      },

      createdAt: "2026-01-01T00:00:00.000Z",

      proofHash: "0xproof"
    },
    "attestguard"
  );
}


test(
  "signed envelope verifies",
  () => {

    const envelope =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );

    assert.equal(
      verifyEnvelopeSignature(envelope),
      true
    );
  }
);


test(
  "changing issuer breaks envelope signature",
  () => {

    const envelope =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );


    const modified = {
      ...envelope,
      issuer: "attacker"
    };


    assert.equal(
      verifyEnvelopeSignature(modified),
      false
    );
  }
);


test(
  "changing proof breaks envelope signature",
  () => {

    const envelope =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );


    const modified = {
      ...envelope,
      proof: {
        ...envelope.proof,
        proofHash: "0xevil"
      }
    };


    assert.equal(
      verifyEnvelopeSignature(modified),
      false
    );
  }
);


test(
  "changing timestamp breaks envelope signature",
  () => {

    const envelope =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );


    const modified = {
      ...envelope,
      createdAt:
        "2030-01-01T00:00:00.000Z"
    };


    assert.equal(
      verifyEnvelopeSignature(modified),
      false
    );
  }
);


test(
  "same envelope produces deterministic signature",
  () => {

    const a =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );


    const b =
      signEnvelope(
        sampleEnvelope(),
        "attestguard"
      );


    assert.equal(
      a.signature.value,
      b.signature.value
    );
  }
);
