import { createHash } from "node:crypto";
import type {
  UnderwritingEvidence,
  UnderwritingProposal,
  UnderwritingReason,
  RiskTier,
} from "./types.js";

const REASON_CODES = new Set<UnderwritingReason>([
  "DELIVERY_VERIFIED",
  "PROOF_VERIFIED",
  "WITHIN_INVOICE_VALUE",
  "WITHIN_SUPPLIER_CAP",
  "LOW_EXISTING_EXPOSURE",
  "STRONG_REPAYMENT_HISTORY",
  "LIMITED_REPAYMENT_HISTORY",
  "DEFAULT_HISTORY",
  "NEW_BUYER_RELATIONSHIP",
  "LARGE_REQUEST",
  "POLICY_OVERRIDE_REQUIRED",
]);

const RISK_TIERS = new Set<RiskTier>(["A", "B", "C", "D"]);
const RELATIONSHIP_REASON_CODES: UnderwritingReason[] = [
  "STRONG_REPAYMENT_HISTORY",
  "LIMITED_REPAYMENT_HISTORY",
  "DEFAULT_HISTORY",
  "NEW_BUYER_RELATIONSHIP",
];

export interface UnderwriterOptions {
  anthropicApiKey?: string;
  model?: string;
  now?: () => number;
  fetchFn?: typeof fetch;
}

interface RawModelProposal {
  recommendedAdvance: string | number;
  riskTier: string;
  confidenceBps: number;
  reasonCodes: string[];
  riskFlags: string[];
}

/**
 * Bounded AI underwriting.
 *
 * The model sees only structured evidence and returns a proposal. It never
 * returns an authorization verdict and it cannot override verified facts.
 * The deterministic envelope below caps the recommendation by invoice value,
 * supplier auto-approve cap, and remaining daily capacity, and also imposes
 * a deterministic risk-tier floor from verified relationship evidence.
 *
 * Critical invariant: if delivery or proof verification is false, the
 * proposal is forced fail-closed to zero advance / risk tier D regardless of
 * what the model returned. The on-chain manager remains the final authority.
 */
export async function underwrite(
  evidence: UnderwritingEvidence,
  opts: UnderwriterOptions = {}
): Promise<UnderwritingProposal> {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const evidenceHash = hashEvidence(evidence);
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  const apiKey = opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return deterministicFallback(evidence, evidenceHash, now());
  }

  try {
    const fetchFn = opts.fetchFn ?? fetch;
    const response = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system:
          "You are a bounded trade-finance underwriting model. Return JSON only. " +
          "You propose a risk tier and advance amount; you do not authorize funding. " +
          "Never claim deliveryVerified or proofVerified when the supplied facts say false. " +
          "Never output a negative amount. Use only the supplied reason codes.",
        messages: [{ role: "user", content: buildPrompt(evidence) }],
      }),
    });

    if (!response.ok) {
      return deterministicFallback(evidence, evidenceHash, now());
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((block) => block.type === "text")?.text;
    if (!text) return deterministicFallback(evidence, evidenceHash, now());

    const raw = parseModelJson(text);
    const validated = validateRawProposal(raw);
    return applyDeterministicEnvelope(evidence, validated, evidenceHash, model, now());
  } catch {
    return deterministicFallback(evidence, evidenceHash, now());
  }
}

export function hashEvidence(evidence: UnderwritingEvidence): string {
  const canonical = JSON.stringify({
    request: {
      invoiceId: evidence.request.invoiceId,
      supplier: evidence.request.supplier,
      buyer: evidence.request.buyer,
      invoiceAmount: evidence.request.invoiceAmount.toString(),
      requestedAdvanceAmount: evidence.request.requestedAdvanceAmount.toString(),
    },
    history: {
      supplier: evidence.history.supplier,
      autoApproveCap: evidence.history.autoApproveCap.toString(),
      fundedToday: evidence.history.fundedToday.toString(),
      perSupplierDailyCap: evidence.history.perSupplierDailyCap.toString(),
      priorAdvancesWithThisBuyer: evidence.history.priorAdvancesWithThisBuyer,
      priorRepaymentsWithThisBuyer: evidence.history.priorRepaymentsWithThisBuyer,
      priorDefaultsWithThisBuyer: evidence.history.priorDefaultsWithThisBuyer,
      historyComplete: evidence.history.historyComplete,
    },
    deliveryVerified: evidence.deliveryVerified,
    proofVerified: evidence.proofVerified,
    invoiceAgeSeconds: evidence.invoiceAgeSeconds,
  });

  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

function buildPrompt(evidence: UnderwritingEvidence): string {
  return JSON.stringify({
    task: "produce an underwriting proposal; never authorize funding",
    constraints: {
      output: {
        recommendedAdvance: "integer string in base units",
        riskTier: ["A", "B", "C", "D"],
        confidenceBps: "integer 0..10000",
        reasonCodes: [...REASON_CODES],
        riskFlags: "array of short strings",
      },
      verifiedFactsAreAuthoritative: true,
      allowedReasonCodes: [...REASON_CODES],
    },
    evidence: {
      invoiceAmount: evidence.request.invoiceAmount.toString(),
      requestedAdvance: evidence.request.requestedAdvanceAmount.toString(),
      deliveryVerified: evidence.deliveryVerified,
      proofVerified: evidence.proofVerified,
      supplierAutoApproveCap: evidence.history.autoApproveCap.toString(),
      supplierFundedToday: evidence.history.fundedToday.toString(),
      supplierDailyCap: evidence.history.perSupplierDailyCap.toString(),
      priorAdvancesWithBuyer: evidence.history.priorAdvancesWithThisBuyer,
      priorRepaymentsWithBuyer: evidence.history.priorRepaymentsWithThisBuyer,
      priorDefaultsWithBuyer: evidence.history.priorDefaultsWithThisBuyer,
      historyComplete: evidence.history.historyComplete,
      invoiceAgeSeconds: evidence.invoiceAgeSeconds,
    },
  });
}

function parseModelJson(text: string): RawModelProposal {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("model output is not an object");
  return parsed as RawModelProposal;
}

function validateRawProposal(raw: RawModelProposal): RawModelProposal {
  if (typeof raw.recommendedAdvance !== "string" && typeof raw.recommendedAdvance !== "number") {
    throw new Error("invalid recommendedAdvance");
  }
  if (typeof raw.recommendedAdvance === "number" && !Number.isSafeInteger(raw.recommendedAdvance)) {
    throw new Error("numeric recommendedAdvance must be a safe integer");
  }

  const amount = BigInt(raw.recommendedAdvance);
  if (amount < 0n) throw new Error("recommendedAdvance cannot be negative");
  if (!RISK_TIERS.has(raw.riskTier as RiskTier)) throw new Error("invalid risk tier");
  if (!Number.isInteger(raw.confidenceBps) || raw.confidenceBps < 0 || raw.confidenceBps > 10_000) {
    throw new Error("invalid confidence");
  }
  if (!Array.isArray(raw.reasonCodes) || raw.reasonCodes.some((r) => !REASON_CODES.has(r as UnderwritingReason))) {
    throw new Error("unknown reason code");
  }
  if (!Array.isArray(raw.riskFlags) || raw.riskFlags.some((flag) => typeof flag !== "string")) {
    throw new Error("invalid risk flags");
  }

  return raw;
}

function applyDeterministicEnvelope(
  evidence: UnderwritingEvidence,
  raw: RawModelProposal,
  evidenceHash: string,
  model: string,
  generatedAt: number
): UnderwritingProposal {
  const modelAmount = BigInt(raw.recommendedAdvance);
  const remainingDaily =
    evidence.history.perSupplierDailyCap > evidence.history.fundedToday
      ? evidence.history.perSupplierDailyCap - evidence.history.fundedToday
      : 0n;
  const hardMax = minBigInt(
    evidence.request.invoiceAmount,
    evidence.history.autoApproveCap,
    remainingDaily
  );

  const recommendedAdvance = modelAmount > hardMax ? hardMax : modelAmount;
  let riskTier = raw.riskTier as RiskTier;
  const reasonCodes = new Set<UnderwritingReason>(raw.reasonCodes as UnderwritingReason[]);
  const riskFlags = [...raw.riskFlags];

  if (modelAmount > hardMax) {
    reasonCodes.add("POLICY_OVERRIDE_REQUIRED");
    riskFlags.push("MODEL_RECOMMENDATION_EXCEEDED_DETERMINISTIC_ENVELOPE");
  }

  // Relationship evidence is a deterministic floor, not an AI preference.
  // A model cannot claim tier A when the chain-derived history is absent,
  // incomplete, or shows no repayment despite prior advances.
  const minimumTier = minimumRiskTier(evidence);
  if (riskTierRank(riskTier) < riskTierRank(minimumTier)) {
    riskTier = minimumTier;
    riskFlags.push("MODEL_RISK_TIER_BELOW_EVIDENCE_FLOOR");
  }
  addEvidenceReasonCodes(evidence, reasonCodes, riskFlags);

  const verificationFailed = !evidence.deliveryVerified || !evidence.proofVerified;
  if (!evidence.deliveryVerified) {
    reasonCodes.delete("DELIVERY_VERIFIED");
    riskFlags.push("DELIVERY_NOT_VERIFIED");
  }
  if (!evidence.proofVerified) {
    reasonCodes.delete("PROOF_VERIFIED");
    riskFlags.push("PROOF_NOT_VERIFIED");
  }
  if (verificationFailed) {
    return {
      proposalVersion: 1,
      invoiceId: evidence.request.invoiceId,
      recommendedAdvance: 0n,
      riskTier: "D",
      confidenceBps: raw.confidenceBps,
      reasonCodes: [...new Set([...reasonCodes, "POLICY_OVERRIDE_REQUIRED"])],
      riskFlags: [...new Set([...riskFlags, "VERIFICATION_REQUIRED_BEFORE_ADVANCE"])],
      evidenceHash,
      modelId: "anthropic",
      modelVersion: model,
      generatedAt,
    };
  }

  return {
    proposalVersion: 1,
    invoiceId: evidence.request.invoiceId,
    recommendedAdvance,
    riskTier,
    confidenceBps: raw.confidenceBps,
    reasonCodes: [...reasonCodes],
    riskFlags: [...new Set(riskFlags)],
    evidenceHash,
    modelId: "anthropic",
    modelVersion: model,
    generatedAt,
  };
}

function deterministicFallback(
  evidence: UnderwritingEvidence,
  evidenceHash: string,
  generatedAt: number
): UnderwritingProposal {
  const reasons: UnderwritingReason[] = [];
  const flags: string[] = [];
  let riskTier: RiskTier = "A";

  if (evidence.deliveryVerified) reasons.push("DELIVERY_VERIFIED");
  if (evidence.proofVerified) reasons.push("PROOF_VERIFIED");

  const verificationFailed = !evidence.deliveryVerified || !evidence.proofVerified;
  if (verificationFailed) {
    reasons.push("POLICY_OVERRIDE_REQUIRED");
    if (!evidence.deliveryVerified) flags.push("DELIVERY_NOT_VERIFIED");
    if (!evidence.proofVerified) flags.push("PROOF_NOT_VERIFIED");
    flags.push("VERIFICATION_REQUIRED_BEFORE_ADVANCE");

    return {
      proposalVersion: 1,
      invoiceId: evidence.request.invoiceId,
      recommendedAdvance: 0n,
      riskTier: "D",
      confidenceBps: 5000,
      reasonCodes: [...new Set(reasons)],
      riskFlags: [...new Set(flags)],
      evidenceHash,
      modelId: "deterministic-fallback",
      modelVersion: "v1",
      generatedAt,
    };
  }

  if (evidence.history.priorDefaultsWithThisBuyer > 0) {
    reasons.push("DEFAULT_HISTORY");
    flags.push("PRIOR_DEFAULTS");
    riskTier = "D";
  } else if (!evidence.history.historyComplete || evidence.history.priorAdvancesWithThisBuyer === 0) {
    reasons.push("NEW_BUYER_RELATIONSHIP");
    flags.push("LIMITED_REPAYMENT_HISTORY");
    if (!evidence.history.historyComplete) flags.push("HISTORY_INCOMPLETE");
    riskTier = "C";
  } else if (evidence.history.priorRepaymentsWithThisBuyer === 0) {
    reasons.push("LIMITED_REPAYMENT_HISTORY");
    riskTier = "B";
  } else {
    reasons.push("STRONG_REPAYMENT_HISTORY");
  }

  const hardMax = minBigInt(
    evidence.request.invoiceAmount,
    evidence.history.autoApproveCap,
    evidence.history.perSupplierDailyCap > evidence.history.fundedToday
      ? evidence.history.perSupplierDailyCap - evidence.history.fundedToday
      : 0n
  );
  const requested = evidence.request.requestedAdvanceAmount;
  const recommendedAdvance = requested < hardMax ? requested : hardMax;

  if (requested > hardMax) {
    reasons.push("POLICY_OVERRIDE_REQUIRED");
    flags.push("REQUEST_EXCEEDS_DETERMINISTIC_ENVELOPE");
  }
  if (requested > evidence.request.invoiceAmount / 2n) {
    reasons.push("LARGE_REQUEST");
  }

  return {
    proposalVersion: 1,
    invoiceId: evidence.request.invoiceId,
    recommendedAdvance,
    riskTier,
    confidenceBps: 5000,
    reasonCodes: [...new Set(reasons)],
    riskFlags: [...new Set(flags)],
    evidenceHash,
    modelId: "deterministic-fallback",
    modelVersion: "v1",
    generatedAt,
  };
}

function minimumRiskTier(evidence: UnderwritingEvidence): RiskTier {
  if (evidence.history.priorDefaultsWithThisBuyer > 0) return "D";
  if (!evidence.history.historyComplete || evidence.history.priorAdvancesWithThisBuyer === 0) return "C";
  if (evidence.history.priorRepaymentsWithThisBuyer === 0) return "B";
  return "A";
}

function riskTierRank(tier: RiskTier): number {
  return { A: 0, B: 1, C: 2, D: 3 }[tier];
}

function addEvidenceReasonCodes(
  evidence: UnderwritingEvidence,
  reasonCodes: Set<UnderwritingReason>,
  riskFlags: string[]
): void {
  for (const reasonCode of RELATIONSHIP_REASON_CODES) {
    reasonCodes.delete(reasonCode);
  }

  if (evidence.history.priorDefaultsWithThisBuyer > 0) {
    reasonCodes.add("DEFAULT_HISTORY");
    riskFlags.push("PRIOR_DEFAULTS");
  } else if (!evidence.history.historyComplete) {
    reasonCodes.add("LIMITED_REPAYMENT_HISTORY");
    riskFlags.push("HISTORY_INCOMPLETE");
  } else if (evidence.history.priorAdvancesWithThisBuyer === 0) {
    reasonCodes.add("NEW_BUYER_RELATIONSHIP");
    riskFlags.push("LIMITED_REPAYMENT_HISTORY");
  } else if (evidence.history.priorRepaymentsWithThisBuyer === 0) {
    reasonCodes.add("LIMITED_REPAYMENT_HISTORY");
  } else {
    reasonCodes.add("STRONG_REPAYMENT_HISTORY");
  }
}

function minBigInt(...values: bigint[]): bigint {
  return values.reduce((min, value) => (value < min ? value : min));
}
