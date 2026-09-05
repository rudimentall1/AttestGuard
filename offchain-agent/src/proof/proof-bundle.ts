import { hashProofBundle } from "./hash.js";

export interface ProofBundleInput {
  invoiceId: string;
  decisionHash: string;
  evidenceHash?: string;
  aiTraceHash?: string;
  policyDecision: string;
  policyReason: string;
  aiRecommendation: string;
  riskTier?: string;
  reportHash?: string;
  timestamp: string;
}

export interface AttestGuardProofBundle {
  version: "1.0";
  type: "UNDERWRITING_PROOF";
  invoiceId: string;
  decision: {
    hash: string;
    policy: string;
    reason: string;
  };
  ai: {
    recommendation: string;
    traceHash?: string;
    authority: "ADVISORY_ONLY";
  };
  evidence: {
    hash?: string;
    riskTier?: string;
  };
  integrity: {
    reportHash?: string;
  };
  createdAt: string;
  proofHash: string;
}

export function createProofBundle(
  input: ProofBundleInput
): AttestGuardProofBundle {
  return {
    version: "1.0",
    type: "UNDERWRITING_PROOF",
    invoiceId: input.invoiceId,
    decision: {
      hash: input.decisionHash,
      policy: input.policyDecision,
      reason: input.policyReason,
    },
    ai: {
      recommendation: input.aiRecommendation,
      traceHash: input.aiTraceHash,
      authority: "ADVISORY_ONLY",
    },
    evidence: {
      hash: input.evidenceHash,
      riskTier: input.riskTier,
    },
    integrity: {
      reportHash: input.reportHash,
    },
    createdAt: input.timestamp,
    proofHash: hashProofBundle({
      invoiceId: input.invoiceId,
      decisionHash: input.decisionHash,
      evidenceHash: input.evidenceHash,
      aiTraceHash: input.aiTraceHash,
      reportHash: input.reportHash,
      policyDecision: input.policyDecision,
      policyReason: input.policyReason,
      aiRecommendation: input.aiRecommendation,
      riskTier: input.riskTier,
      timestamp: input.timestamp,
    }),
  };
}









