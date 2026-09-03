export type AdvanceStatus =
  | "registered"
  | "auto_funded"
  | "pending_confirmation"
  | "funded"
  | "rejected";

export interface AdvanceRequest {
  invoiceId: string; // bytes32 hex
  supplier: string; // address
  buyer: string; // address
  invoiceAmount: bigint;
  requestedAdvanceAmount: bigint;
}

export interface SupplierHistory {
  supplier: string;
  autoApproveCap: bigint;
  fundedToday: bigint;
  perSupplierDailyCap: bigint;
  priorAdvancesWithThisBuyer: number;
  priorRepaymentsWithThisBuyer: number;
  priorDefaultsWithThisBuyer: number;
  historyComplete: boolean;
}

export type PolicyDecision =
  | { verdict: "AUTO_APPROVE"; reason: string }
  | { verdict: "WARN"; reason: string }
  | { verdict: "BLOCK"; reason: string };

export type RiskTier = "A" | "B" | "C" | "D";

export type UnderwritingReason =
  | "DELIVERY_VERIFIED"
  | "PROOF_VERIFIED"
  | "WITHIN_INVOICE_VALUE"
  | "WITHIN_SUPPLIER_CAP"
  | "LOW_EXISTING_EXPOSURE"
  | "STRONG_REPAYMENT_HISTORY"
  | "LIMITED_REPAYMENT_HISTORY"
  | "DEFAULT_HISTORY"
  | "NEW_BUYER_RELATIONSHIP"
  | "LARGE_REQUEST"
  | "POLICY_OVERRIDE_REQUIRED";

export interface UnderwritingEvidence {
  request: AdvanceRequest;
  history: SupplierHistory;
  deliveryVerified: boolean;
  proofVerified: boolean;
  invoiceAgeSeconds: number;
}

export interface UnderwritingProposal {
  proposalVersion: 1;
  invoiceId: string;
  recommendedAdvance: bigint;
  riskTier: RiskTier;
  confidenceBps: number;
  reasonCodes: UnderwritingReason[];
  riskFlags: string[];
  evidenceHash: string;
  modelId: string;
  modelVersion: string;
  generatedAt: number;
}
