import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAdvancePolicy } from "../src/policy.js";
import type { AdvanceRequest, SupplierHistory } from "../src/types.js";

function baseRequest(overrides: Partial<AdvanceRequest> = {}): AdvanceRequest {
  return {
    invoiceId: "0x" + "11".repeat(32),
    supplier: "0x1111111111111111111111111111111111111a",
    buyer: "0x2222222222222222222222222222222222222b",
    invoiceAmount: 1000n,
    requestedAdvanceAmount: 400n,
    ...overrides,
  };
}

function baseHistory(overrides: Partial<SupplierHistory> = {}): SupplierHistory {
  return {
    supplier: "0x1111111111111111111111111111111111111a",
    autoApproveCap: 500n,
    fundedToday: 0n,
    perSupplierDailyCap: 2000n,
    priorAdvancesWithThisBuyer: 3,
    priorRepaymentsWithThisBuyer: 2,
    priorDefaultsWithThisBuyer: 0,
    historyComplete: true,
    ...overrides,
  };
}

test("auto-approves a routine advance within all caps with clean history", () => {
  const decision = evaluateAdvancePolicy(baseRequest(), baseHistory());
  assert.equal(decision.verdict, "AUTO_APPROVE");
});

test("blocks an advance that requests more than the invoice is worth", () => {
  const decision = evaluateAdvancePolicy(
    baseRequest({ requestedAdvanceAmount: 1500n }),
    baseHistory()
  );
  assert.equal(decision.verdict, "BLOCK");
  assert.match(decision.reason, /exceeds invoice face value/);
});

test("blocks a zero or negative advance amount", () => {
  const decision = evaluateAdvancePolicy(baseRequest({ requestedAdvanceAmount: 0n }), baseHistory());
  assert.equal(decision.verdict, "BLOCK");
});

test("warns when amount exceeds the supplier's auto-approve cap", () => {
  const decision = evaluateAdvancePolicy(
    baseRequest({ requestedAdvanceAmount: 600n }),
    baseHistory({ autoApproveCap: 500n })
  );
  assert.equal(decision.verdict, "WARN");
  assert.match(decision.reason, /auto-approve cap/);
});

test("warns when funding would breach the supplier's daily cap even under the per-advance cap", () => {
  const decision = evaluateAdvancePolicy(
    baseRequest({ requestedAdvanceAmount: 400n }),
    baseHistory({ autoApproveCap: 1000n, fundedToday: 1800n, perSupplierDailyCap: 2000n })
  );
  assert.equal(decision.verdict, "WARN");
  assert.match(decision.reason, /daily cap/);
});

test("blocks a buyer with a prior default because the evidence is not enforced on-chain", () => {
  const decision = evaluateAdvancePolicy(
    baseRequest({ requestedAdvanceAmount: 50n }),
    baseHistory({ priorDefaultsWithThisBuyer: 1 })
  );
  assert.equal(decision.verdict, "BLOCK");
  assert.match(decision.reason, /automatic funding is disabled/);
});

test("blocks the very first advance tied to a new buyer relationship", () => {
  const decision = evaluateAdvancePolicy(baseRequest(), baseHistory({ priorAdvancesWithThisBuyer: 0 }));
  assert.equal(decision.verdict, "BLOCK");
  assert.match(decision.reason, /first advance/);
});

test("a defaulted buyer takes priority over an otherwise-clean cap check", () => {
  const decision = evaluateAdvancePolicy(
    baseRequest({ requestedAdvanceAmount: 5000n, invoiceAmount: 20000n }),
    baseHistory({ autoApproveCap: 10000n, perSupplierDailyCap: 10000n, priorDefaultsWithThisBuyer: 2 })
  );
  assert.equal(decision.verdict, "BLOCK");
  assert.match(decision.reason, /prior default/);
});
