import assert from "node:assert/strict";
import test from "node:test";

import { applyAIBoundary } from "../src/ai-boundary.js";

test("AI cannot override deterministic BLOCK", () => {
  const result = applyAIBoundary(
    "BLOCKED_BY_POLICY",
    "AUTO_PATH"
  );

  assert.equal(
    result.route,
    "BLOCKED_BY_POLICY"
  );
});


test("AI can escalate AUTO_PATH into REVIEW", () => {
  const result = applyAIBoundary(
    "AUTO_PATH",
    "REVIEW"
  );

  assert.equal(
    result.route,
    "REVIEW"
  );
});


test("AI does not change clean AUTO_PATH without escalation", () => {
  const result = applyAIBoundary(
    "AUTO_PATH",
    "AUTO_PATH"
  );

  assert.equal(
    result.route,
    "AUTO_PATH"
  );
});


test("AI boundary fails closed without recommendation", () => {
  const result = applyAIBoundary(
    "AUTO_PATH",
    undefined
  );

  assert.equal(
    result.route,
    "AUTO_PATH"
  );
});
