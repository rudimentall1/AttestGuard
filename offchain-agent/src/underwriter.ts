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
 * supplier auto-approve cap, and remaining daily capacity.
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
    // AI failure is fail-closed for the AI layer, but does not alter the
    // existing deterministic funding path. A deterministic proposal keeps
    // the audit trail useful when the model is unavailable.
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
      priorDefaultsWithThisBuyer: evidence.history.priorDefaultsWithThisBuyer,
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
      priorDefaultsWithBuyer: evidence.history.priorDefaultsWithThisBuyer,
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
  const reasonCodes = new Set<UnderwritingReason>(raw.reasonCodes as UnderwritingReason[]);
  const riskFlags = [...raw.riskFlags];

  if (modelAmount > hardMax) {
    reasonCodes.add("POLICY_OVERRIDE_REQUIRED");
    riskFlags.push("MODEL_RECOMMENDATION_EXCEEDED_DETERMINISTIC_ENVELOPE");
  }

  if (!evidence.deliveryVerified) {
    reasonCodes.delete("DELIVERY_VERIFIED");
    riskFlags.push("DELIVERY_NOT_VERIFIED");
  }
  if (!evidence.proofVerified) {
    reasonCodes.delete("PROOF_VERIFIED");
    riskFlags.push("PROOF_NOT_VERIFIED");
  }

  return {
    proposalVersion: 1,
    invoiceId: evidence.request.invoiceId,
    recommendedAdvance,
    riskTier: raw.riskTier as RiskTier,
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

  if (evidence.history.priorDefaultsWithThisBuyer > 0) {
    reasons.push("DEFAULT_HISTORY");
    flags.push("PRIOR_DEFAULTS");
    riskTier = "D";
  } else if (evidence.history.priorAdvancesWithThisBuyer === 0) {
    reasons.push("NEW_BUYER_RELATIONSHIP");
    flags.push("LIMITED_REPAYMENT_HISTORY");
    riskTier = "C";
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
    riskFlags: flags,
    evidenceHash,
    modelId: "deterministic-fallback",
    modelVersion: "v1",
    generatedAt,
  };
}

function minBigInt(...values: bigint[]): bigint {
  return values.reduce((min, value) => (value < min ? value : min));
}
