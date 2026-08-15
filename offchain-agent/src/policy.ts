import type { AdvanceRequest, SupplierHistory, PolicyDecision } from "./types.js";

/**
 * This is a pre-check, not the safety boundary. Its only job is to save gas
 * by not bothering to fetch a proof and submit a transaction for a request
 * that AttestGuardManager.sol would reject anyway. The actual, unbypassable
 * enforcement lives on-chain in `_applyPolicyAndMaybeFund` — this function
 * is deliberately kept in close mirror-step with that Solidity logic so the
 * two rarely disagree, but if they ever do, the chain wins.
 *
 * This mirrors a lesson learned the hard way in an earlier project: an
 * "advisory-only" check that an agent can silently skip is not a safety
 * boundary. Here, the off-chain check is explicitly *only* an optimization;
 * the boundary is the smart contract.
 */
export function evaluateAdvancePolicy(
  request: AdvanceRequest,
  history: SupplierHistory
): PolicyDecision {
  if (request.requestedAdvanceAmount > request.invoiceAmount) {
    return {
      verdict: "BLOCK",
      reason: "requested advance exceeds invoice face value",
    };
  }

  if (request.requestedAdvanceAmount <= BigInt(0)) {
    return { verdict: "BLOCK", reason: "requested advance amount must be positive" };
  }

  if (history.priorDefaultsWithThisBuyer > 0) {
    return {
      verdict: "WARN",
      reason: `buyer has ${history.priorDefaultsWithThisBuyer} prior default(s) on record; needs human review even though this event will still be independently verified on-chain`,
    };
  }

  const projectedDailyTotal = history.fundedToday + request.requestedAdvanceAmount;

  if (request.requestedAdvanceAmount > history.autoApproveCap) {
    return {
      verdict: "WARN",
      reason: `requested amount (${request.requestedAdvanceAmount}) exceeds this supplier's current auto-approve cap (${history.autoApproveCap}); on-chain policy will also flag this for guardian confirmation`,
    };
  }

  if (projectedDailyTotal > history.perSupplierDailyCap) {
    return {
      verdict: "WARN",
      reason: `funding this would push the supplier's daily total to ${projectedDailyTotal}, above the ${history.perSupplierDailyCap} daily cap`,
    };
  }

  if (history.priorAdvancesWithThisBuyer === 0) {
    return {
      verdict: "WARN",
      reason: "first advance ever tied to this buyer relationship; within caps, but flagged for visibility",
    };
  }

  return { verdict: "AUTO_APPROVE", reason: "within auto-approve cap and daily limit, buyer has clean history" };
}
