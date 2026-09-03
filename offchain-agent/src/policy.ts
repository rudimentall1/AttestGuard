import type { AdvanceRequest, SupplierHistory, PolicyDecision } from "./types.js";

/**
 * This is a pre-check, not the safety boundary. Its only job is to save gas
 * by not bothering to fetch a proof and submit a transaction for a request
 * that AttestGuardManager.sol would reject anyway. The actual, unbypassable
 * enforcement lives on-chain in `_applyPolicyAndMaybeFund` — this function
 * is deliberately kept in close mirror-step with that Solidity logic so the
 * two rarely disagree, but if they ever do, the chain wins.
 *
 * Security invariant: a WARN may only be used for conditions that the
 * on-chain path can itself turn into PendingConfirmation. Relationship
 * history is currently off-chain evidence, so a WARN on defaults or a new
 * buyer relationship could otherwise be followed by fundAdvanceFromQuery and
 * accidentally become an automatic on-chain payment. Those conditions are
 * therefore BLOCKed here until the corresponding evidence is enforced
 * on-chain or a dedicated manual-review submission path exists.
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
      verdict: "BLOCK",
      reason: `buyer has ${history.priorDefaultsWithThisBuyer} prior default(s) on record; automatic funding is disabled because this relationship evidence is not yet enforced on-chain`,
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
      verdict: "BLOCK",
      reason: "first advance ever tied to this buyer relationship; automatic funding is disabled until a dedicated manual-review path or on-chain relationship policy exists",
    };
  }

  return { verdict: "AUTO_APPROVE", reason: "within auto-approve cap and daily limit, buyer has clean history" };
}
