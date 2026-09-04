import fs from "node:fs";

export type UnderwritingAuditEvent = {
  invoiceId: string;
  decisionHash: string;
  policyDecision: "AUTO" | "WARN" | "BLOCK";
  aiRiskTier?: "A" | "B" | "C" | "D";
  recommendation:
    | "APPROVE"
    | "REVIEW"
    | "BLOCK";
  confidence?: number;
  explanation?: string;
  deterministicReason?: string;
  finalOutcome?: "APPROVE" | "REVIEW" | "BLOCK";
  requiresHumanReview?: boolean;
  evidenceHash?: string;
  riskFlags?: string[];
  routingRoute?:
    | "BLOCKED_BY_POLICY"
    | "ONCHAIN_GUARDIAN_REVIEW"
    | "AI_REVIEW_RECOMMENDED"
    | "AUTO_PATH";
  reasonCodes: string[];
  timestamp: string;
};

export function appendUnderwritingAuditEvent(
  path: string,
  event: UnderwritingAuditEvent
): void {
  const directory = path.replace(/[\\/][^\\/]+$/, "");

  if (directory && !fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.appendFileSync(
    path,
    JSON.stringify(event) + "\n",
    "utf8"
  );
}
