import fs from "node:fs";

import { createProofBundle } from "../proof/proof-bundle.js";
import { createEnvelope } from "../proof/envelope-builder.js";
import { signEnvelope } from "../proof/envelope-sign.js";


const issuer = "attestguard-demo";


const proof = createProofBundle({
  invoiceId: "demo-invoice-001",

  decisionHash:
    "0xdecision-demo",

  evidenceHash:
    "0xevidence-demo",

  aiTraceHash:
    "0xai-demo",

  reportHash:
    "0xreport-demo",

  policyDecision:
    "AUTO_APPROVE",

  policyReason:
    "trusted supplier",

  aiRecommendation:
    "AUTO_PATH",

  riskTier:
    "A",

  timestamp:
    new Date().toISOString()
});


const envelope =
  createEnvelope(
    proof,
    issuer
  );


const signed =
  signEnvelope(
    envelope,
    issuer
  );


fs.writeFileSync(
  "./attestguard-proof.json",
  JSON.stringify(
    signed,
    null,
    2
  )
);


console.log(
  "ATTESTGUARD proof created:"
);

console.log(
  "./attestguard-proof.json"
);
