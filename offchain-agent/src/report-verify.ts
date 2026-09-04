import { hashReport } from "./report-hash.js";

export function verifyReportIntegrity(
  report: {
    decisionId: string;
    reportHash?: string;
    integrity: {
      decisionHash: string;
      evidenceHash?: string;
      aiTraceHash?: string;
    };
  }
): boolean {
  if (report.integrity.decisionHash !== report.decisionId) {
    return false;
  }

  if (!report.integrity.evidenceHash) {
    return false;
  }

  if (!report.integrity.aiTraceHash) {
    return false;
  }

  if (report.reportHash) {
    const { reportHash, ...withoutHash } = report;

    if (hashReport(withoutHash) !== reportHash) {
      return false;
    }
  }

  return true;
}
