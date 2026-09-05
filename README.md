# AttestGuard

AI-assisted trade finance workflow with deterministic policy control on Creditcoin.

AttestGuard allows suppliers to receive invoice advances after delivery events are cryptographically verified.

The core idea:

**AI can analyze and recommend. AI cannot authorize financial actions.**

Built for **BUIDL CTC 2026 Fall**.

---

# 30-second overview

Traditional invoice financing has a trust problem.

Before sending money, a financing provider needs to know:

- Did the delivery really happen?
- Is the buyer history reliable?
- How much can safely be advanced?
- Can the decision be verified later?

Most existing systems depend on manual checks, centralized databases, or trusted intermediaries.

AttestGuard replaces this with:

- cryptographic event verification through Attestcoin Protocol;
- deterministic financial policy enforcement;
- AI-assisted analysis with strict safety boundaries.

The AI agent helps process information and create underwriting evidence.

It does not control money.

---

# How it works


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
+---- Policy passed
| |
| v
| Auto funding
|
+---- Policy exceeded
|
v
Guardian review


The system separates two different questions.

## 1. Did the event happen?

Answered by Attestcoin Protocol.

The system does not trust:

- API responses;
- centralized oracle claims;
- AI statements.

The delivery event must have cryptographic proof.

## 2. Should funding happen?

Answered by deterministic policy rules.

The contract checks:

- advance limits;
- supplier caps;
- repayment history;
- risk boundaries;
- review requirements.

The AI agent cannot bypass these rules.

---

# Why AttestGuard exists

AI agents are becoming capable of performing financial workflows.

The problem:

Giving an AI unrestricted financial authority creates unacceptable risks.

AttestGuard follows a different approach:

AI performs analysis.

Blockchain and deterministic rules control execution.

This creates a system where AI can be useful without becoming the final authority.

---

# Architecture

## Smart Contracts

### AttestGuardManager.sol

Main protocol contract.

Responsibilities:

- verify Attestcoin proofs;
- enforce funding policies;
- prevent replay attacks;
- store underwriting commitments;
- provide pause protection.

### TradeConfirmation.sol

Source-chain demo contract.

A buyer confirms delivery and creates an event that can later be verified through Attestcoin Protocol.

### DemoAdvanceToken.sol

Demo ERC20 token used for payout simulation.

---

# Off-chain Agent

Location:


offchain-agent/src


The agent handles:

- blockchain event monitoring;
- proof processing;
- supplier history loading;
- underwriting preparation;
- report generation;
- integrity verification;
- decision commitment creation.

Main components:


worker.ts
policy.ts
underwriter.ts
history.ts
report.ts
proof/


The agent prepares decisions.

The contract controls execution.

---

# AI Safety Model

The main rule:

> AI can recommend. AI cannot authorize.

The AI layer can:

- analyze evidence;
- generate explanations;
- create risk notes;
- suggest additional review.

The AI layer cannot:

- increase funding limits;
- approve blocked requests;
- bypass policy;
- move funds.

Important outputs are committed through hashes:

- evidence hash;
- decision hash;
- AI trace hash.

This allows later verification of what the system actually produced.

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

---

# Live deployment

Current demo deployment:

## Creditcoin CC3 testnet

AttestGuardManager:


0x7d73424a8256C0b2BA245e5d5a3De8820E45F390


EvmV1Decoder:


0x73b647cbA2FE75Ba05B8e12ef8F8D6327D6367bF


DemoAdvanceToken:


0xAE519FC2Ba8e6fFE6473195c092bF1BAe986ff90


Explorer:

https://creditcoin-testnet.blockscout.com/address/0x7d73424a8256C0b2BA245e5d5a3De8820E45F390

## Ethereum Sepolia

TradeConfirmation:


0x8FA8Ef84036D81824A6EAab7C26A6d385c8d005F


---

# Decision hash trail

The manager stores underwriting decision commitments.

The off-chain agent creates a deterministic decision identity from:

- underwriting proposal;
- evidence;
- AI trace;
- security-relevant parameters.

The blockchain stores the commitment for auditability.

The contract does not trust the AI output.

It only stores a verifiable record.

---

# Verification

Agent tests:


80 / 80 passing


Covered:

- proof verification;
- signature verification;
- tamper detection;
- deterministic decisions;
- AI safety boundaries;
- underwriting validation;
- review routing;
- audit trail generation.

Run locally:

```bash
npm run build:agent

npm run test:agent

npm run demo:full
Demo example

Input:

Invoice amount: $50,000
Supplier history: VERIFIED
Risk tier: A

AI recommendation:

APPROVE $100,000
Confidence: 0.99

Deterministic policy:

Maximum allowed advance: $40,000

Result:

AI override rejected

Policy engine has final authority

FINAL STATUS:
REVIEW_REQUIRED

The AI suggestion is preserved for audit, but cannot bypass financial controls.

Repository structure
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
Track fit
AI

Autonomous AI workflow with deterministic safety boundaries.

The model assists with analysis but cannot authorize financial execution.

RWA

Invoice financing represents a real-world asset workflow backed by verified delivery events.

DeFi

The protocol creates programmable financing logic with transparent rules.

Limitations

This is a hackathon prototype.

Current limitations:

invoice registration remains an administrative trust boundary;
production deployment requires identity/KYC integration;
liquidity providers are not implemented;
additional source chains require adapters.

These limitations are known engineering steps.

Roadmap

Future improvements:

financing operator dashboard;
live advance monitoring;
multi-chain support;
supplier reputation system;
production identity layer;
improved AI explanations;
decentralized liquidity providers.
Security Principles

AttestGuard follows three principles:

Verify inputs cryptographically.
Keep financial decisions deterministic.
Make AI actions auditable.

The goal is not to replace financial controls with AI.

The goal is to make AI useful inside systems where safety rules remain stronger than the model itself.

License

MIT
