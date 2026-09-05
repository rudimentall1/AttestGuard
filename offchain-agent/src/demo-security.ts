import { evaluateAdvancePolicy } from "./policy.js";
import { underwrite } from "./underwriter.js";
import { routeReview, shouldHoldForReview } from "./routing.js";
import type { AdvanceRequest, SupplierHistory, UnderwritingEvidence } from "./types.js";

const request: AdvanceRequest = {
  invoiceId: "0x" + "46".repeat(32),
  supplier: "0x9999999999999999999999999999999999999c",
  buyer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad",
  invoiceAmount: 50_000_000_000n,
  requestedAdvanceAmount: 45_000_000_000n,
};

const history: SupplierHistory = {
  supplier: request.supplier,
  autoApproveCap: 60_000_000_000n,
  fundedToday: 0n,
  perSupplierDailyCap: 100_000_000_000n,
  priorAdvancesWithThisBuyer: 2,
  priorRepaymentsWithThisBuyer: 1,
  priorDefaultsWithThisBuyer: 1,
  historyComplete: true,
};

async function main() {
  console.log("");
  console.log("================================================");
  console.log("       ATTESTGUARD AI SECURITY DEMO");
  console.log("================================================");
  console.log("");

  console.log("Scenario (synthetic):");
  console.log(`Invoice amount: ${Number(request.invoiceAmount) / 1e6} USDC`);
  console.log(`Requested advance: ${Number(request.requestedAdvanceAmount) / 1e6} USDC (within supplier's cap)`);
  console.log("Buyer history: 1 prior default on record");
  console.log("");

  const decision = evaluateAdvancePolicy(request, history);
  console.log("Deterministic Policy Engine:");
  console.log(`Verdict: ${decision.verdict}`);
  console.log(`Reason: ${decision.reason}`);
  console.log("");

  const evidence: UnderwritingEvidence = { request, history, deliveryVerified: true, proofVerified: true, invoiceAgeSeconds: 900 };
  const underwriting = await underwrite(evidence);
  console.log("Bounded AI Underwriting:");
  console.log(`Risk tier: ${underwriting.riskTier}`);
  console.log(`Recommended advance: ${Number(underwriting.recommendedAdvance) / 1e6} USDC`);
  console.log("");

  const routing = routeReview(request, decision, underwriting);
  console.log("AI Boundary:");
  console.log(decision.verdict === "BLOCK" ? "BLOCKED - Deterministic BLOCK - no AI recommendation can override this" : `Route: ${routing.route}`);
  console.log("");

  console.log("Final Decision:");
  console.log(decision.verdict === "BLOCK" ? "BLOCKED - fundAdvanceFromQuery is never called" : routing.route);
  console.log("");
  console.log("Security guarantees demonstrated above:");
  console.log(`- AI recommended tier ${underwriting.riskTier}; policy verdict was still ${decision.verdict}`);
  console.log(`- funding hold flag: ${shouldHoldForReview(routing.route)}`);
  console.log("");
  console.log("================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});