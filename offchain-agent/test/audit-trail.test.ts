import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendUnderwritingAuditEvent } from "../src/audit-trail.js";

test("underwriting audit trail persists a decision event", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "attestguard-audit-")
  );

  const auditPath = path.join(
    tempDir,
    "audit",
    "underwriting-events.jsonl"
  );

  const event = {
    invoiceId: "0x" + "11".repeat(32),
    decisionHash: "0x" + "22".repeat(32),
    policyDecision: "WARN" as const,
    aiRiskTier: "C" as const,
    recommendation: "REVIEW" as const,
    confidence: 0.82,
    reasonCodes: [
      "NEW_BUYER",
      "HIGH_AMOUNT"
    ],
    timestamp: "2026-09-04T00:00:00.000Z",
  };

  try {
    appendUnderwritingAuditEvent(auditPath, event);

    const lines = fs
      .readFileSync(auditPath, "utf8")
      .trim()
      .split(/\r?\n/);

    assert.equal(lines.length, 1);

    const saved = JSON.parse(lines[0]);

    assert.equal(saved.invoiceId, event.invoiceId);
    assert.equal(saved.decisionHash, event.decisionHash);
    assert.equal(saved.policyDecision, "WARN");
    assert.equal(saved.recommendation, "REVIEW");
    assert.deepEqual(saved.reasonCodes, event.reasonCodes);
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
