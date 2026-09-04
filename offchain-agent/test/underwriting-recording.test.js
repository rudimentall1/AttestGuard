import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";
import { ensureUnderwritingDecisionRecorded } from "../src/underwriting-recording.js";
const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-1"));
const differentDecisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-2"));
test("records underwriting decision when no commitment exists", async () => {
    let writeCalls = 0;
    const recorder = {
        underwritingDecisionHash: async (_invoiceId) => ethers.ZeroHash,
        recordUnderwritingDecision: async (_invoiceId, _decisionHash) => {
            writeCalls += 1;
            return {
                wait: async () => ({
                    hash: "0x" + "11".repeat(32),
                }),
            };
        },
    };
    const result = await ensureUnderwritingDecisionRecorded(recorder, invoiceId, decisionHash);
    assert.equal(result, "RECORDED_NOW");
    assert.equal(writeCalls, 1);
});
test("reuses an identical existing underwriting commitment without writing again", async () => {
    let writeCalls = 0;
    const recorder = {
        underwritingDecisionHash: async (_invoiceId) => decisionHash,
        recordUnderwritingDecision: async () => {
            writeCalls += 1;
            return {
                wait: async () => ({
                    hash: "0x" + "22".repeat(32),
                }),
            };
        },
    };
    const result = await ensureUnderwritingDecisionRecorded(recorder, invoiceId, decisionHash);
    assert.equal(result, "ALREADY_RECORDED");
    assert.equal(writeCalls, 0);
});
test("fails closed when the existing underwriting commitment conflicts", async () => {
    let writeCalls = 0;
    const recorder = {
        underwritingDecisionHash: async (_invoiceId) => differentDecisionHash,
        recordUnderwritingDecision: async () => {
            writeCalls += 1;
            return {
                wait: async () => ({
                    hash: "0x" + "33".repeat(32),
                }),
            };
        },
    };
    await assert.rejects(ensureUnderwritingDecisionRecorded(recorder, invoiceId, decisionHash), /underwriting decision hash mismatch/);
    assert.equal(writeCalls, 0);
});
