import assert from "node:assert/strict";
import test from "node:test";

import { verifyReportIntegrity } from "../src/report-verify.js";
import { hashReport } from "../src/report-hash.js";

function createReport() {
  const report = {
    decisionId: "0x123",
    integrity: {
      decisionHash: "0x123",
      evidenceHash: "0xevidence",
      aiTraceHash: "0xtrace",
    },
  };

  return {
    ...report,
    reportHash: hashReport(report),
  };
}

test("accepts untouched underwriting report", () => {
  assert.equal(
    verifyReportIntegrity(createReport()),
    true
  );
});

test("rejects modified decision hash", () => {
  const report = createReport();

  report.integrity.decisionHash = "0xchanged";

  assert.equal(
    verifyReportIntegrity(report),
    false
  );
});

test("rejects modified evidence hash", () => {
  const report = createReport();

  report.integrity.evidenceHash = "0xchanged";

  assert.equal(
    verifyReportIntegrity(report),
    false
  );
});

test("rejects modified AI trace hash", () => {
  const report = createReport();

  report.integrity.aiTraceHash = "0xchanged";

  assert.equal(
    verifyReportIntegrity(report),
    false
  );
});
