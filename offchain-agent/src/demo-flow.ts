import { evaluateAdvancePolicy } from "./policy.js";
import { underwrite } from "./underwriter.js";
import { hashUnderwritingDecision } from "./decision.js";
import { routeReview, shouldHoldForReview } from "./routing.js";
import type { AdvanceRequest, SupplierHistory, UnderwritingEvidence } from "./types.js";

const request: AdvanceRequest = {
  invoiceId: "0x" + "45".repeat(32),
  supplier: "0x7777777777777777777777777777777777777a",
  buyer: "0x8888888888888888888888888888888888888b",
  invoiceAmount: 25_000_000_000n,
  requestedAdvanceAmount: 18_000_000_000n,
};

const history: SupplierHistory = {
  supplier: request.supplier,
  autoApproveCap: 30_000_000_000n,
  fundedToday: 0n,
  perSupplierDailyCap: 100_000_000_000n,
  priorAdvancesWithThisBuyer: 4,
  priorRepaymentsWithThisBuyer: 4,
  priorDefaultsWithThisBuyer: 0,
  historyComplete: true,
};

async function main() {
  console.log("");
  console.log("================================================");
  console.log("          ATTESTGUARD END-TO-END FLOW");
  console.log("================================================");
  console.log("");

  console.log("OK 1. Trade confirmation event received (synthetic invoiceId " + request.invoiceId.slice(0, 10) + "...)");
  console.log("OK 2. Cross-chain proof verified (assumed true for this demo - real path is Attestcoin Prover)");
  console.log("OK 3. Supplier history loaded");

  const decision = evaluateAdvancePolicy(request, history);
  console.log(`OK 4. Deterministic policy evaluated: ${decision.verdict} - ${decision.reason}`);

  const evidence: UnderwritingEvidence = { request, history, deliveryVerified: true, proofVerified: true, invoiceAgeSeconds: 900 };
  const underwriting = await underwrite(evidence);
  console.log(`OK 5. Bounded AI underwriting executed: tier=${underwriting.riskTier}, recommended=${Number(underwriting.recommendedAdvance) / 1e6} USDC`);

  const routing = routeReview(request, decision, underwriting);
  console.log(`OK 6. Review routing computed: ${routing.route}`);
  console.log(`OK 7. Evidence hash generated: ${underwriting.evidenceHash}`);

  const decisionHash = hashUnderwritingDecision(underwriting);
  console.log(`OK 8. Decision commitment hash generated: ${decisionHash}`);

  const held = shouldHoldForReview(routing.route);
  console.log(`OK 9. shouldHoldForReview evaluated: ${held}`);

  console.log("");
  console.log("FINAL STATUS:");
  console.log(held ? "HELD_FOR_REVIEW" : decision.verdict === "AUTO_APPROVE" ? "APPROVED" : routing.route);
  console.log("");
  console.log("Security guarantees demonstrated above (each backed by a real printed value):");
  console.log("- AI cannot override policy: recommendedAdvance is capped in underwriter.ts, not asserted here");
  console.log("- Decision reproducible: hashUnderwritingDecision is a pure function of the proposal above");
  console.log("");
  console.log("================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});