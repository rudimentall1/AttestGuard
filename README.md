# AttestGuard

AI-assisted trade finance workflow with deterministic policy control on Creditcoin.

AttestGuard allows a supplier to receive an advance against an invoice after a delivery event is cryptographically verified.

The main idea is simple:

- blockchain proofs verify that an event really happened;
- deterministic rules decide whether funding is allowed;
- AI helps analyze and explain, but never controls money movement.

Built for **BUIDL CTC 2026 Fall**.

---

## Problem

In traditional invoice financing, a supplier may wait weeks or months to receive payment.

A financing provider has to answer:

- Did delivery actually happen?
- Is the buyer reliable?
- How much can safely be advanced?
- Can the decision be audited later?

Most existing systems rely on centralized data providers and manual verification.

AttestGuard replaces this with a proof-based workflow.

---

## How it works


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


The system separates two decisions:

### 1. Did the event happen?

Verified by Attestcoin Protocol.

The system does not trust an API response or an oracle claim.

### 2. Should funding happen?

Verified by deterministic policy rules.

The AI agent cannot bypass these rules.

---

# Architecture

## Smart contracts

### AttestGuardManager.sol

Main funding controller.

Responsibilities:

- verifies proofs;
- applies funding limits;
- prevents replay attacks;
- supports pause protection;
- stores underwriting commitments.

### TradeConfirmation.sol

Demo source-chain contract.

A buyer confirms delivery, creating an event that can later be proven through Attestcoin.

---

## Off-chain agent

Location:


offchain-agent/src


The agent handles:

- event monitoring;
- proof processing;
- supplier history loading;
- underwriting preparation;
- report generation;
- integrity verification.

Important:

The AI layer is advisory only.

The final funding decision comes from deterministic policy checks.

---

# AI Safety Model

The project was designed around one rule:

> AI can recommend. AI cannot authorize.

The agent can:

- generate risk notes;
- explain decisions;
- suggest review.

The agent cannot:

- increase limits;
- approve blocked requests;
- bypass contract rules.

All important outputs are hashed:

- evidence hash;
- decision hash;
- AI trace hash.

This allows later verification of what the agent produced.

---

# Current implementation status

Implemented:

? AttestGuardManager contract  
? Proof-gated funding flow  
? Repayment verification flow  
? Replay protection  
? Pause protection  
? Deterministic underwriting policy  
? AI recommendation boundary  
? Evidence hashing  
? Underwriting reports  
? Proof bundle generation  
? Off-chain worker architecture  

Current local verification:


npm run compile
npm run test:contracts
npm run build:agent
npm run test:agent
npm run demo:full


Results:


Smart contracts:
38 passing

Agent tests:
80 passing


---

# Demo

Run:

```bash
npm install

npm run build:agent

npm run demo:full

Example flow:

Trade event received
        |
Proof verified
        |
Supplier history loaded
        |
AI recommendation generated
        |
Policy engine evaluated
        |
Report created
        |
Integrity verified
        |
Blockchain commitment ready

Example result:

AI recommendation:
APPROVE $100,000

Policy limit:
$40,000

Result:
REVIEW_REQUIRED

The AI suggestion is rejected because it exceeds deterministic limits.

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
        proof/

deploy/
    deployment scripts

contracts-test/
    Hardhat tests
Local development

Requirements:

Node.js 24+
npm
Hardhat

Install:

npm install

Compile:

npm run compile

Run contract tests:

npm run test:contracts

Build agent:

npm run build:agent

Run agent tests:

npm run test:agent
Limitations

The current version is a hackathon prototype.

Known limitations:

invoice registration is still an administrative trust boundary;
production deployment would require identity/KYC integration;
production funding would require real liquidity providers;
multi-chain support requires additional adapters.

These are planned improvements, not hidden assumptions.

Roadmap
Next steps
web dashboard for financing operators;
real-time advance monitoring;
more source-chain integrations;
supplier reputation system;
production-grade identity layer;
improved AI explanation models.
Security principles

AttestGuard follows three principles:

Verify inputs cryptographically.
Keep financial decisions deterministic.
Make AI outputs auditable.

The goal is not to replace financial controls with AI.

The goal is to make AI usable inside systems where safety rules remain stronger than the model itself.

License

MIT
