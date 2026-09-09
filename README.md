# AttestGuard

**[Live demo page →](https://rudimentall1.github.io/AttestGuard/)**: real on-chain proof, live deployment addresses, test results.

AI-assisted trade finance workflow with deterministic policy control on Creditcoin.

AttestGuard lets suppliers receive invoice advances once delivery is cryptographically verified, not once someone believes it happened. The core idea driving the whole design: **AI can analyze and recommend. AI cannot authorize financial actions.**

Built for **BUIDL CTC 2026 Fall**.

---

# 30-second overview

Traditional invoice financing has a trust problem. Before sending money, a financing provider needs to know whether the delivery really happened, whether the buyer's history is reliable, how much can safely be advanced, and whether the decision can be checked later. Most existing systems answer these questions with manual checks, centralized databases, or an intermediary everyone just has to trust.

AttestGuard answers them differently: cryptographic event verification through the Attestcoin Protocol, deterministic financial policy enforcement in the contract itself, and an AI layer that helps process information and build the underwriting evidence but never touches the money.

---

# How it works

```
Buyer confirms delivery
        |
        v
TradeConfirmation.sol
        |
        v
Attestcoin Protocol proof
        |
        v
AttestGuardManager.sol
        |
        +---- Policy passed  ----> Auto funding
        |
        +---- Policy exceeded ---> Guardian review
```

The system keeps two questions separate, and answers them with two different mechanisms.

## 1. Did the event happen?

Answered by the Attestcoin Protocol, not by anything AttestGuard says about itself. It doesn't trust API responses, centralized oracle claims, or anything the AI produces. The delivery event needs actual cryptographic proof before anything downstream can act on it.

## 2. Should funding happen?

Answered by deterministic policy rules baked into the contract: advance limits, supplier caps, repayment history, risk boundaries, when a human needs to sign off. The AI agent has no way around any of it.

---

# Why AttestGuard exists

AI agents are getting capable enough to run real financial workflows, and that's exactly the problem: giving an AI unrestricted financial authority is a bad trade even when the AI is usually right. AttestGuard splits the job instead: the AI does the analysis, the blockchain and a set of deterministic rules control what actually executes. That split is what lets the AI be genuinely useful without ever becoming the final word on whether money moves.

---

# Architecture

## Smart Contracts

### AttestGuardManager.sol

The main protocol contract. It verifies Attestcoin proofs, enforces funding policy, blocks replay attacks, stores underwriting commitments, and can be paused.

### TradeConfirmation.sol

The source-chain demo contract. A buyer confirms delivery here, which creates the event that Attestcoin Protocol later verifies.

### DemoAdvanceToken.sol

A demo ERC20 used to simulate payouts.

---

# Off-chain Agent

Lives in `offchain-agent/src`. It watches for blockchain events, processes proofs, loads a supplier's verified history, prepares the underwriting evidence, generates reports, checks integrity, and creates the decision commitment. The main pieces:

```
worker.ts
policy.ts
underwriter.ts
history.ts
report.ts
proof/
```

The agent prepares the decision. The contract is what actually controls execution, and that division doesn't bend for convenience anywhere in the codebase.

---

# AI Safety Model

The rule this whole project is built around:

> AI can recommend. AI cannot authorize.

The AI layer can analyze evidence, generate explanations, create risk notes, and suggest extra review. It cannot raise funding limits, approve something that was blocked, bypass policy, or move funds. None of those paths exist for it. The important outputs (evidence, decision, AI trace) are committed as hashes, so what the system actually produced can be checked later instead of taken on faith.

---

# Current implementation status

Implemented:

- AttestGuardManager contract
- TradeConfirmation flow
- Attestcoin proof verification path
- proof-gated funding flow
- repayment verification flow
- replay protection
- pause protection
- deterministic underwriting policy
- bounded AI underwriting
- evidence hashing
- underwriting reports
- proof bundle generation
- off-chain worker architecture
- review routing
- share-based liquidity accounting for depositors

---

# Live deployment

Current demo deployment (redeployed with share-based liquidity accounting; the three previous addresses, 0x7d73424a8256C0b2BA245e5d5a3De8820E45F390, 0x59AF421cB35fc23aB6C8ee42743e6176040031f4, and 0x048827Fea5864e14F3824a6B2487cdEe889EA5D8, are all stale and no longer used):

> **Note on the demo video:** the walkthrough video linked from the DoraHacks
> submission was recorded against an earlier address. The mechanism it shows
> is unchanged; only the deployed address and owner key are different now.

## Creditcoin CC3 testnet

AttestGuardManager:

```
0xf2a9ad1450aEa713886912578128FE3312dC52C5
```

EvmV1Decoder:

```
0x10774e375da23eE7418Cea823Be6147ed7453349
```

DemoAdvanceToken:

```
0x7dcd03F4375A60A3e511F8D0473a5494bE42048E
```

Explorer:

https://creditcoin-testnet.blockscout.com/address/0xf2a9ad1450aEa713886912578128FE3312dC52C5

## Ethereum Sepolia

TradeConfirmation:

```
0x8FA8Ef84036D81824A6EAab7C26A6d385c8d005F
```

---

# Proven on-chain, not just in tests

Ran the full cycle for real on the current deployment above, three separate signed transactions, all public.

1. **Buyer confirms delivery on Sepolia**
   [`0x156506e315f4f6e6cf691ce07dbddcf1dde526e649ed53d7493e3dce35ad1e68`](https://sepolia.etherscan.io/tx/0x156506e315f4f6e6cf691ce07dbddcf1dde526e649ed53d7493e3dce35ad1e68)
2. **Proof submitted to AttestGuardManager on Creditcoin.** This is a brand-new supplier/buyer relationship, so the contract itself, not the off-chain agent, flags it for guardian confirmation instead of auto-funding, even though the amount is well within the funding cap.
   [`0xecdb307365ff852ed1ee8a9a9a6fb4e784ed77857eeac4f107e8c19c602c20eb`](https://creditcoin-testnet.blockscout.com/tx/0xecdb307365ff852ed1ee8a9a9a6fb4e784ed77857eeac4f107e8c19c602c20eb)
3. **Guardian confirms it, advance is funded.**
   [`0xae6c29aef8ebc9c56100d7d0e0155390c736fe26667aae97508a148a1ad7e4df`](https://creditcoin-testnet.blockscout.com/tx/0xae6c29aef8ebc9c56100d7d0e0155390c736fe26667aae97508a148a1ad7e4df)

Step 2 is the one that matters: the on-chain relationship guardrail actually firing on mainnet-equivalent infrastructure against a real Attestcoin proof, not a mocked one inside a Hardhat test.

# Decision hash trail

The manager stores underwriting decision commitments. The off-chain agent builds a deterministic decision identity from the underwriting proposal, the evidence, the AI trace, and the security-relevant parameters, and the blockchain stores that commitment for auditability. The contract never trusts the AI output itself. It only ever stores a verifiable record of it.

---

# Verification

Agent tests:

```
58 / 58 passing
```

Covered: report/proof-bundle integrity (hash-based, tamper-evident, not a cryptographic signature), deterministic decisions, AI safety boundaries, underwriting validation, review routing, and audit trail generation.

Run locally:

```bash
npm run build:agent
npm run test:agent
npm run demo:full
```

## Demo example

This is the actual captured output of `npm run demo:full` against this repo's synthetic demo scenario (`generate-report.ts`), not a hand-written narrative:

```
DECISION:
Outcome: REVIEW
Risk tier: A

DETERMINISTIC POLICY ENGINE:
Verdict: WARN
Reason: requested amount (60000000000) exceeds this supplier's current
auto-approve cap (40000000000); on-chain policy will also flag this for
guardian confirmation

BOUNDED AI UNDERWRITING:
Recommendation: 40000000000 base units
Review required: false

INTEGRITY (real hashes, computed by generate-report.ts):
Decision hash:  0x7fa5170969a6de2c0522bdfa81fe5bdbae74aacaa182b2eb033d8416374bc272
Evidence hash:  0xe40f59c09afb5b0868c1d17f32483f7f68e7697761a64fb8aa18a12e3715df4c
AI trace hash:  0xf02328421210c857863f9fb91262762e834ac0760f3efbe09831aef2b763e179

FINAL STATUS: REVIEW
```

The AI's recommendation is capped at the supplier's auto-approve limit before it ever reaches the policy engine. The policy engine still has final say, and this scenario ends in `REVIEW`, not an automatic payout. For a real first-time-buyer payout actually going through `PendingConfirmation` on live infrastructure, see "Proven on-chain" above: that one used real money-path transactions, this one is the local synthetic scenario the test suite and `npm run demo:full` exercise on every run.

## Repository structure

```
contracts/
    src/
        AttestGuardManager.sol
        TradeConfirmation.sol
        DemoAdvanceToken.sol

offchain-agent/
    src/
        worker.ts
        policy.ts
        underwriter.ts
        history.ts
        report.ts

deploy/

contracts-test/
```

---

# Track fit

**AI.** An autonomous AI workflow with deterministic safety boundaries: the model assists with analysis but has no path to authorizing financial execution.

**RWA.** Invoice financing is a real-world-asset workflow, and here it's backed by cryptographically verified delivery events instead of paperwork someone has to trust.

**DeFi.** The protocol turns that into programmable financing logic with rules anyone can read on-chain, not rules that live in a spreadsheet.

---

# Limitations

This is a hackathon prototype, and it's worth being direct about where it still falls short of production:

- invoice registration is still an administrative trust boundary (the owner registers invoices; see SECURITY.md for exactly what that means);
- production deployment would need identity/KYC integration;
- liquidity depositors can now withdraw their own share (fixed, see "Current implementation status" above), but there's still no yield mechanism, since repayment doesn't currently flow back into the vault;
- additional source chains would need their own adapters.

These are known next steps, not things being quietly ignored.

# Roadmap

- financing operator dashboard
- live advance monitoring
- multi-chain support
- supplier reputation system
- production identity layer
- improved AI explanations
- a real yield mechanism for liquidity providers, tied to repayment actually flowing back into the vault

# Security Principles

Three things this project tries to hold to everywhere: verify inputs cryptographically, keep financial decisions deterministic, and make AI actions auditable. The goal was never to replace financial controls with AI. It's to make AI useful inside a system where the safety rules stay stronger than the model itself.

# License

MIT
