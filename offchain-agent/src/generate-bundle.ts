import fs from "node:fs";
import crypto from "node:crypto";

import { createProofBundle } from "./proof/proof-bundle.js";
import { verifyProofBundle } from "./proof/proof-verifier.js";

const reportPath = "artifacts/underwriting-report.json";

if (!fs.existsSync(reportPath)) {
  console.log("Report not found. Run:");
  console.log("npm run report");
  process.exit(1);
}

const report = fs.readFileSync(reportPath, "utf8");

const reportHash =
  "0x" +
  crypto
    .createHash("sha256")
    .update(report)
    .digest("hex");

const bundle = createProofBundle({
  invoiceId: "demo-invoice",
  decisionHash: reportHash,
  evidenceHash: reportHash,
  aiTraceHash: reportHash,
  policyDecision: "APPROVE",
  policyReason: "Passed deterministic policy checks",
  aiRecommendation: "APPROVE",
  riskTier: "LOW",
  reportHash,
  timestamp: new Date().toISOString()
});

verifyProofBundle(bundle);

fs.writeFileSync(
  "artifacts/attestguard-proof-bundle.json",
  JSON.stringify(bundle, null, 2)
);

console.log("Proof bundle generated:");
console.log("artifacts/attestguard-proof-bundle.json");
