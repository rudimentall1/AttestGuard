import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendToReviewQueue } from "../src/worker.js";

test("review queue writes an entry once and ignores an identical retry", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "attestguard-review-")
  );
  const queuePath = path.join(tempDir, "review", "queue.jsonl");

  const entry = {
    invoiceId: "0x" + "11".repeat(32),
    reason: "bounded underwriting recommends human review",
    decisionHash: "0x" + "22".repeat(32),
    queuedAt: "2026-09-04T00:00:00.000Z",
  };

  try {
    const first = appendToReviewQueue(queuePath, entry);
    const second = appendToReviewQueue(queuePath, {
      ...entry,
      queuedAt: "2026-09-04T00:01:00.000Z",
    });

    assert.equal(first, true);
    assert.equal(second, false);

    const lines = fs
      .readFileSync(queuePath, "utf8")
      .trim()
      .split(/\r?\n/);

    assert.equal(lines.length, 1);

    const queued = JSON.parse(lines[0]);

    assert.equal(queued.invoiceId, entry.invoiceId);
    assert.equal(queued.decisionHash, entry.decisionHash);
    assert.equal(queued.queuedAt, entry.queuedAt);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("review queue allows a new decision hash for the same invoice", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "attestguard-review-")
  );
  const queuePath = path.join(tempDir, "queue.jsonl");

  const entry = {
    invoiceId: "0x" + "33".repeat(32),
    reason: "human review required",
    decisionHash: "0x" + "44".repeat(32),
    queuedAt: "2026-09-04T00:00:00.000Z",
  };

  try {
    const first = appendToReviewQueue(queuePath, entry);
    const second = appendToReviewQueue(queuePath, {
      ...entry,
      decisionHash: "0x" + "55".repeat(32),
      queuedAt: "2026-09-04T00:01:00.000Z",
    });

    assert.equal(first, true);
    assert.equal(second, true);

    const lines = fs
      .readFileSync(queuePath, "utf8")
      .trim()
      .split(/\r?\n/);

    assert.equal(lines.length, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
