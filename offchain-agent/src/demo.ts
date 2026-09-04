import { hashReport } from "./report-hash.js";
import { verifyReportIntegrity } from "./report-verify.js";

const decisionId =
  "0xd4cd9ccbf11f058b18de31988714aa436786df2f02db6971dd220551be9dd440";

const report = {
  decisionId,

  integrity: {
    decisionHash: decisionId,
    evidenceHash:
      "0xevidence123456789",
    aiTraceHash:
      "0xaitrace123456789",
  },

  summary: {
    outcome: "APPROVE",
    riskTier: "A",
    confidence: 0.97,
  },

  policy: {
    verdict: "AUTO_APPROVE",
  },

  timestamp: new Date().toISOString(),
};

const reportHash = hashReport(report);

const finalReport = {
  ...report,
  reportHash,
};

console.log("");
console.log("=================================");
console.log("      ATTESTGUARD DEMO");
console.log("=================================");
console.log("");

console.log("Decision:");
console.log(finalReport.decisionId);

console.log("");

console.log("Policy:");
console.log(finalReport.policy.verdict);

console.log("");

console.log("Risk Tier:");
console.log(finalReport.summary.riskTier);

console.log("");

console.log("Evidence Hash:");
console.log(finalReport.integrity.evidenceHash);

console.log("");

console.log("AI Trace Hash:");
console.log(finalReport.integrity.aiTraceHash);

console.log("");

console.log("Report Hash:");
console.log(finalReport.reportHash);

console.log("");

console.log("Integrity:");
console.log(
  verifyReportIntegrity(finalReport)
    ? "VERIFIED"
    : "FAILED"
);

console.log("");
console.log("Blockchain Commitment:");
console.log("READY");

console.log("");
console.log("=================================");
