import fs from "node:fs";
import crypto from "node:crypto";

import { createProofBundle } from "./proof/proof-bundle.js";
import { verifyProofBundle } from "./proof/verify.js";

const reportPath = "artifacts/underwriting-report.json";

if (!fs.existsSync(reportPath)) {
  console.log("Report not found. Run:");
  console.log("npm run report");
  process.exit(1);
}

const reportText = fs.readFileSync(reportPath, "utf8");
const report = JSON.parse(reportText);

const reportHash = "0x" + crypto.createHash("sha256").update(reportText).digest("hex");

const bundle = createProofBundle({
  invoiceId: report.decisionId,
  decisionHash: report.integrity.decisionHash,
  evidenceHash: report.integrity.evidenceHash,
  aiTraceHash: report.integrity.aiTraceHash,
  policyDecision: report.policy.verdict,
  policyReason: report.policy.reason,
  aiRecommendation: report.ai.recommendation,
  riskTier: report.summary.riskTier,
  reportHash,
  timestamp: new Date().toISOString(),
});

const bundleOk = verifyProofBundle(bundle);
if (!bundleOk) {
  console.error("verifyProofBundle rejected the bundle just built - refusing to write it.");
  process.exit(1);
}

fs.writeFileSync("artifacts/attestguard-proof-bundle.json", JSON.stringify(bundle, null, 2));

console.log("Proof bundle generated from the real report above (verifyProofBundle: PASSED):");
console.log("artifacts/attestguard-proof-bundle.json");