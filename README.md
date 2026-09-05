# AttestGuard

AI-assisted trade finance workflow with deterministic policy control on Creditcoin.

AttestGuard enables suppliers to receive invoice advances after delivery events are cryptographically verified.

The core principle:

> AI can analyze and recommend. AI cannot authorize financial actions.

Built for **BUIDL CTC 2026 Fall**.

Primary track: **AI**  
Additional fit: **RWA / DeFi**

---

# Judge Quick Start

Run the complete local demonstration:

```bash
npm install

npm run build:agent

npm run demo:full

The demo shows:

Trade event
     |
     v
Attestcoin proof verification
     |
     v
AI underwriting analysis
     |
     v
Deterministic policy engine
     |
     v
Decision report + proof bundle
     |
     v
Blockchain commitment

Example:

Invoice amount:
$50,000

AI recommendation:
APPROVE $100,000

Policy maximum:
$40,000

Result:
REVIEW_REQUIRED

The AI recommendation is rejected because it exceeds deterministic limits.

Problem

Invoice financing requires trust.

A financing provider must know:

Did delivery actually happen?
Is the buyer reliable?
How much can safely be advanced?
Can the decision be audited later?

Traditional systems rely on manual checks, centralized databases and trusted intermediaries.

AttestGuard replaces this with:

cryptographic event verification;
deterministic financial rules;
auditable AI assistance.
How AttestGuard Works

A buyer confirms delivery on the source chain.

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
     +----+----+
     |         |
 Policy OK   Policy exceeded
     |         |
 Auto fund   Guardian review

The system separates two questions.

1. Did the event happen?

Verified through Attestcoin Protocol.

The system does not trust:

API responses;
centralized oracle claims;
AI statements.

The event must be proven cryptographically.

2. Should funding happen?

Controlled by deterministic policy rules.

The policy checks:

advance limits;
supplier caps;
repayment history;
risk boundaries;
review requirements.
AI Control Boundary

AttestGuard follows one rule:

AI can recommend. AI cannot authorize.

The AI agent can:

analyze information;
generate risk explanations;
create underwriting notes;
suggest review.

The AI agent cannot:

increase funding limits;
bypass policy rules;
approve blocked requests;
move funds.

Important outputs are hashed:

evidence hash;
decision hash;
AI trace hash.

This allows later verification of what the system produced.

Architecture
Smart Contracts
AttestGuardManager.sol

Main protocol contract.

Responsibilities:

verify Attestcoin proofs;
enforce funding policy;
prevent replay attacks;
store underwriting commitments;
provide pause protection.
TradeConfirmation.sol

Source-chain demo contract.

A buyer confirms delivery and creates an event that can later be verified through Attestcoin.

DemoAdvanceToken.sol

Demo ERC20 token used for advance funding simulation.

Off-chain Agent

Location:

offchain-agent/src

The agent handles:

blockchain event monitoring;
proof processing;
supplier history loading;
underwriting preparation;
report generation;
integrity verification;
decision commitments.

Main components:

worker.ts
policy.ts
underwriter.ts
history.ts
report generation
proof verification
Current Implementation

Implemented:

AttestGuardManager contract;
TradeConfirmation flow;
Attestcoin proof verification path;
proof-gated funding flow;
repayment verification;
replay protection;
pause protection;
deterministic underwriting policy;
AI recommendation boundary;
evidence hashing;
underwriting reports;
proof bundle generation;
off-chain worker architecture;
review routing.
Verification

Current local verification:

Agent tests:

80 / 80 passing

Covered:

proof verification;
signature validation;
tamper detection;
deterministic decision identity;
AI boundary enforcement;
underwriting validation;
audit trail persistence;
review routing.

Run:

npm run build:agent

npm run test:agent
Deployment
Creditcoin CC3 Testnet

AttestGuardManager:

0x7d73424a8256C0b2BA245e5d5a3De8820E45F390

EvmV1Decoder:

0x73b647cbA2FE75Ba05B8e12ef8F8D6327D6367bF

DemoAdvanceToken:

0xAE519FC2Ba8e6fFE6473195c092bF1BAe986ff90

Explorer:

https://creditcoin-testnet.blockscout.com/address/0x7d73424a8256C0b2BA245e5d5a3De8820E45F390

Ethereum Sepolia

TradeConfirmation:

0x8FA8Ef84036D81824A6EAab7C26A6d385c8d005F
Repository Structure
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

    deployment scripts


contracts-test/

    Hardhat tests
Demo Commands

Build agent:

npm run build:agent

Run tests:

npm run test:agent

Run complete demo:

npm run demo:full
Track Fit
AI

An autonomous AI workflow operates with strict safety boundaries.

The model assists with analysis but cannot control financial execution.

RWA

Invoice financing is a real-world asset workflow backed by verified delivery events.

DeFi

The system creates a programmable financing primitive with transparent rules.

Limitations

This is a hackathon prototype.

Current limitations:

invoice registration remains an administrative trust boundary;
production deployment requires identity/KYC integration;
liquidity providers are not implemented;
additional source chains require adapters.

These are known engineering steps.

Roadmap

Future improvements:

operator dashboard;
live advance monitoring;
more source-chain integrations;
supplier reputation system;
production identity layer;
improved AI explanations;
multi-chain support.
Security Principles

AttestGuard is built around three principles:

Verify inputs cryptographically.
Keep financial decisions deterministic.
Make AI actions auditable.

The goal is not to replace financial controls with AI.

The goal is to make AI usable inside systems where safety rules remain stronger than the model itself.

License

MIT