import fs from "node:fs";

console.log("");
console.log("================================================");
console.log("          ATTESTGUARD JUDGE DEMO");
console.log("================================================");

const reportPath = "artifacts/underwriting-report.json";

if (!fs.existsSync(reportPath)) {
  console.error("Missing underwriting report. Run report generation first.");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

console.log("");
console.log("DECISION:");
console.log(report.decision.status);
console.log(report.decision.reason);

console.log("");
console.log("AI GOVERNANCE:");
console.log(`Recommendation: ${report.aiAgent.recommendation}`);
console.log(`Requested advance: ${report.aiAgent.requestedAdvance}`);
console.log(`Policy maximum: ${report.policyEngine.maximumAdvance}`);
console.log("AI override allowed:", report.policyEngine.aiOverrideAllowed);

console.log("");
console.log("INTEGRITY:");
console.log("Evidence hash:", report.integrity.evidenceHash);
console.log("AI trace hash:", report.integrity.aiTraceHash);
console.log("Report verification state:", report.integrity.reportVerified);

console.log("");
console.log("BLOCKCHAIN:");
console.log("Commitment status:", report.blockchain.commitmentStatus);

console.log("");
console.log("================================================");
console.log(" Demo displays generated artifacts. It does not claim unperformed verification.");
console.log("================================================");
