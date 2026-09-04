import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeUnderwritingReport } from "../src/report.js";
test("underwriting report persists decision artifact", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attestguard-report-"));
    const reportPath = path.join(dir, "report.json");
    writeUnderwritingReport(reportPath, {
        reportVersion: "1.0",
        decisionId: "0x123",
        integrity: {
            decisionHash: "0x123",
            evidenceHash: "0xevidence",
            aiTraceHash: "0xtrace",
        },
        summary: {
            outcome: "APPROVE",
            riskTier: "A",
            confidence: 0.97,
        },
        policy: {
            verdict: "AUTO_APPROVE",
            reason: "within deterministic limits",
        },
        ai: {
            explanation: "low risk profile",
            recommendation: "AUTO_PATH",
        },
        evidence: {
            hash: "0xevidence",
            flags: [],
        },
        review: {
            required: false,
        },
        timestamp: new Date().toISOString(),
    });
    assert.equal(fs.existsSync(reportPath), true);
    const saved = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(saved.reportVersion, "1.0");
    assert.equal(saved.decisionId, "0x123");
    assert.equal(saved.evidence.hash, "0xevidence");
});
