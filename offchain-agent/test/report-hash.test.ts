import assert from "node:assert/strict";
import test from "node:test";

import { hashReport } from "../src/report-hash.js";

test("report hash is deterministic", () => {
  const report = {
    decisionId: "0x123",
    outcome: "APPROVE",
    riskTier: "A",
  };

  const first = hashReport(report);
  const second = hashReport(report);

  assert.equal(first, second);
});

test("report hash changes after tampering", () => {
  const original = {
    decisionId: "0x123",
    outcome: "APPROVE",
  };

  const modified = {
    decisionId: "0x123",
    outcome: "BLOCK",
  };

  assert.notEqual(
    hashReport(original),
    hashReport(modified)
  );
});
