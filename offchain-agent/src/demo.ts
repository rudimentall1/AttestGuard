import { evaluateAdvancePolicy } from "./policy.js";
import { underwrite } from "./underwriter.js";
import { hashUnderwritingDecision } from "./decision.js";
import { routeReview } from "./routing.js";
import { hashReport } from "./report-hash.js";
import { verifyReportIntegrity } from "./report-verify.js";
import type { AdvanceRequest, SupplierHistory, UnderwritingEvidence } from "./types.js";

const request: AdvanceRequest = {
  invoiceId: "0x" + "44".repeat(32),
  supplier: "0x5555555555555555555555555555555555555e",
  buyer: "0x6666666666666666666666666666666666666f",
  invoiceAmount: 30_000_000_000n,
  requestedAdvanceAmount: 20_000_000_000n,
};

const history: SupplierHistory = {
  supplier: request.supplier,
  autoApproveCap: 40_000_000_000n,
  fundedToday: 0n,
  perSupplierDailyCap: 100_000_000_000n,
  priorAdvancesWithThisBuyer: 5,
  priorRepaymentsWithThisBuyer: 5,
  priorDefaultsWithThisBuyer: 0,
  historyComplete: true,
};

async function main() {
  const decision = evaluateAdvancePolicy(request, history);
  const evidence: UnderwritingEvidence = {
    request,
    history,
    deliveryVerified: true,
    proofVerified: true,
    invoiceAgeSeconds: 600,
  };
  const underwriting = await underwrite(evidence);
  const routing = routeReview(request, decision, underwriting);
  const decisionHash = hashUnderwritingDecision(underwriting);

  const report = {
    decisionId: decisionHash,
    integrity: {
      decisionHash,
      evidenceHash: underwriting.evidenceHash,
      aiTraceHash: decisionHash,
    },
    summary: { outcome: routing.route === "AUTO_PATH" ? "APPROVE" : routing.route, riskTier: underwriting.riskTier, confidence: underwriting.confidenceBps / 10000 },
    policy: { verdict: decision.verdict },
    timestamp: new Date().toISOString(),
  };
  const reportHash = hashReport(report);
  const finalReport = { ...report, reportHash };

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
  console.log(verifyReportIntegrity(finalReport) ? "VERIFIED" : "FAILED");
  console.log("");
  console.log("=================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});