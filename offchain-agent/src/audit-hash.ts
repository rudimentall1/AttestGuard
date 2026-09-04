import { createHash } from "node:crypto";

export function hashAuditTrace(input: {
  decisionHash: string;
  aiApplied?: boolean;
  aiReason?: string;
  aiFinalRoute?: string;
  routingRoute?: string;
  reasonCodes: string[];
}): string {
  const canonical = JSON.stringify({
    decisionHash: input.decisionHash,
    aiApplied: input.aiApplied ?? false,
    aiReason: input.aiReason ?? "",
    aiFinalRoute: input.aiFinalRoute ?? "",
    routingRoute: input.routingRoute ?? "",
    reasonCodes: [...input.reasonCodes].sort(),
  });

  return `0x${createHash("sha256")
    .update(canonical)
    .digest("hex")}`;
}
