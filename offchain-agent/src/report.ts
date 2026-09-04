import fs from "node:fs";

export type UnderwritingDecisionReport = {
  reportVersion: "1.0";
  decisionId: string;
  reportHash?: string;

  summary: {
    outcome: "APPROVE" | "REVIEW" | "BLOCK";
    riskTier?: "A" | "B" | "C" | "D";
    confidence?: number;
  };

  policy: {
    verdict: string;
    reason: string;
  };

  ai: {
    explanation?: string;
    recommendation: string;
  };

  evidence: {
    hash?: string;
    flags?: string[];
  };

  review: {
    required: boolean;
  };

  timestamp: string;
};

export function writeUnderwritingReport(
  path: string,
  report: UnderwritingDecisionReport
): void {
  const directory = path.replace(/[\\/][^\\/]+$/, "");

  if (directory && !fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(
    path,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}
