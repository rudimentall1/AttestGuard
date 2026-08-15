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
  priorDefaultsWithThisBuyer: number;
}

export type PolicyDecision =
  | { verdict: "AUTO_APPROVE"; reason: string }
  | { verdict: "WARN"; reason: string }
  | { verdict: "BLOCK"; reason: string };
