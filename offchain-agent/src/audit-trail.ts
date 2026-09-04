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
