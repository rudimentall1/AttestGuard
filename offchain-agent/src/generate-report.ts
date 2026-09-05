import fs from "node:fs";
import { evaluateAdvancePolicy } from "./policy.js";
import { underwrite } from "./underwriter.js";
import { hashUnderwritingDecision } from "./decision.js";
import { routeReview, shouldHoldForReview } from "./routing.js";
import { hashAuditTrace } from "./audit-hash.js";
import { writeUnderwritingReport, type UnderwritingDecisionReport } from "./report.js";
import type { AdvanceRequest, SupplierHistory, UnderwritingEvidence } from "./types.js";

// Synthetic demo scenario, picked to exercise the WARN -> AI review path.
// Every value below this point is computed by real project code, not
// hardcoded - see judge-demo.ts / generate-bundle.ts, which read this
// report back and never re-invent these numbers.
const request: AdvanceRequest = {
  invoiceId: "0x" + "42".repeat(32),
  supplier: "0x1111111111111111111111111111111111111a",
  buyer: "0x2222222222222222222222222222222222222b",
  invoiceAmount: 75_000_000_000n,
  requestedAdvanceAmount: 60_000_000_000n,
};

const history: SupplierHistory = {
  supplier: request.supplier,
  autoApproveCap: 40_000_000_000n,
  fundedToday: 0n,
  perSupplierDailyCap: 100_000_000_000n,
  priorAdvancesWithThisBuyer: 3,
  priorRepaymentsWithThisBuyer: 3,
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
    invoiceAgeSeconds: 3600,
  };
  const underwriting = await underwrite(evidence);
  const routing = routeReview(request, decision, underwriting);
  const decisionHash = hashUnderwritingDecision(underwriting);
  const holdsFunding = shouldHoldForReview(routing.route);
  const aiTraceHash = hashAuditTrace({
    decisionHash,
    aiApplied: holdsFunding,
    aiReason: routing.reason,
    aiFinalRoute: routing.route,
    routingRoute: routing.route,
    reasonCodes: [routing.reason],
  });

  const outcome: "APPROVE" | "REVIEW" | "BLOCK" =
    decision.verdict === "BLOCK" ? "BLOCK" : routing.route === "AUTO_PATH" ? "APPROVE" : "REVIEW";

  const report: UnderwritingDecisionReport = {
    reportVersion: "1.0",
    decisionId: decisionHash,
    integrity: { decisionHash, evidenceHash: underwriting.evidenceHash, aiTraceHash },
    summary: { outcome, riskTier: underwriting.riskTier, confidence: underwriting.confidenceBps / 10000 },
    policy: { verdict: decision.verdict, reason: decision.reason },
    ai: {
      recommendation: `${underwriting.recommendedAdvance.toString()} base units`,
      traceHash: aiTraceHash,
    },
    evidence: { hash: underwriting.evidenceHash, flags: underwriting.riskFlags },
    review: { required: holdsFunding },
    timestamp: new Date().toISOString(),
  };

  if (!fs.existsSync("artifacts")) fs.mkdirSync("artifacts", { recursive: true });
  writeUnderwritingReport("artifacts/underwriting-report.json", report);

  console.log("OK underwriting-report.json generated from real evaluateAdvancePolicy/underwrite output");
  console.log(`  decision: ${outcome}, riskTier: ${underwriting.riskTier}, reviewRequired: ${holdsFunding}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});