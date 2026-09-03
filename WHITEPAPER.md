# AttestGuard

**Trade-finance advances, funded only when the underlying event is
cryptographically verified — and only when a deterministic, on-chain policy
says the amount is safe to release.**

Version 0.3 (proof-gated repayment + bounded AI underwriting) - September 2026

---

## Abstract

Trade finance — a supplier advancing goods against an invoice, then waiting
30-90 days (or paying a discount to a factoring desk) to get paid — is still
gated on someone manually checking that delivery happened before money moves.
That check is either slow (a human reviewing paperwork) or centralized (an
oracle operator whose word you have to trust).

AttestGuard removes the trust requirement from event verification and puts a
deterministic safety boundary around autonomous execution. It uses
Creditcoin's Attestcoin Protocol to cryptographically verify that a
delivery-confirmation event really happened on a source chain, with no oracle
operator in the loop, and gates every fund release behind deterministic,
on-chain policy. A bounded AI underwriter can interpret verified evidence and
recommend an amount/risk tier, but it cannot authorize funding or weaken a
policy verdict.

The system also closes the previously documented repayment trust gap:
repayment-driven reputation now requires a distinct `RepaymentConfirmed`
event and the same proof-gated verification model used for funding.

This document describes the current architecture and its explicit trust
boundaries. Live deployment claims refer only to versions actually deployed
and recorded in the repository.

## Problem Statement

**The event-verification problem.** A financing decision that depends on
"did the buyer receive the goods" needs a source of truth. Today that source
is often a person, a centralized API, or an oracle network. Every one adds a
trust assumption.

**The AI-agent-authority problem.** An AI agent that initiates financial
transactions should not be able to move money outside pre-agreed bounds,
regardless of whether its reasoning is good, bad, manipulated, or wrong.

**Why both at once.** Solving only event verification gives you a verified
fact without a safety policy. Solving only agent guardrails gives you safe
action without trustworthy external evidence. AttestGuard composes the two:
cryptographic input verification plus immutable output constraints.

## Vision & Mission

The mission is narrow on purpose: make "an AI agent autonomously financing
real-world trade" something a lender, a supplier, or an auditor can verify
independently rather than something they must take on faith.

The same pattern can generalize to event-triggered financial flows such as
insurance payouts, escrow releases, supply-chain milestone payments, and
SLA penalties: a model proposes or explains; cryptography establishes facts;
an immutable policy decides what may happen.

## Market Context

Trade finance has a persistent global financing gap, disproportionately
affecting smaller suppliers for whom manual verification and underwriting
costs do not scale. Automating event verification while preserving hard
financial safety rails is the core economic thesis of AttestGuard.

Creditcoin is already oriented toward real-world credit and lending
infrastructure, while Attestcoin provides cross-chain event verification.
AttestGuard applies that infrastructure to a concrete trade-finance workflow
rather than presenting a generic "AI plus blockchain" demo.

## Technical Architecture

Buyer confirms delivery         Attestcoin Protocol            AttestGuardManager.sol
   on source chain      ---->   proves it happened      --->   (on Creditcoin)
  (TradeConfirmation.sol)       (no oracle operator)            |
                                                                 |-- policy-safe --> auto-fund
                                                                 |-- over threshold --> guardian
                                                                 |-- repayment proof --> reputation

**Components:**

- `TradeConfirmation.sol` (source chain, Ethereum Sepolia in the current
  demo) emits `DeliveryConfirmed` when a buyer confirms delivery.
- `AttestGuardManager.sol` (Creditcoin CC3 testnet deployment) verifies
  inclusion and continuity proofs through Creditcoin's Block Prover precompile
  and decodes the underlying transaction using `EvmV1Decoder`.
- `offchain-agent/` watches source-chain events, obtains proofs, runs a
  deterministic policy mirror, builds verified history evidence, invokes the
  bounded AI underwriter when configured, and submits proof queries.
- `history.ts` derives buyer/supplier relationship history from the manager's
  own emitted events. It counts historical registrations and
  proof-gated repayments and deliberately does not infer defaults from
  `AdvanceRejected`.
- `underwriter.ts` treats model output as untrusted data: strict schema
  validation, evidence hashing, deterministic amount caps and fail-closed
  verification are applied before the proposal is used operationally.
- `routing.ts` is monotonic advisory routing. It can escalate review, but it
  cannot weaken a deterministic `BLOCK` or `WARN` decision.

**Data flow for a single advance:**

1. Owner registers an invoice on `AttestGuardManager` (supplier, buyer,
   invoice amount, requested advance amount). This remains an explicit admin
   trust boundary.
2. Buyer calls `confirmDelivery` on the source chain.
3. The off-chain agent detects the event, waits for Creditcoin attestation,
   and fetches an Attestcoin proof.
4. The agent builds evidence and may ask the bounded AI underwriter for a
   proposal. The model receives verified facts; its output is not authority.
5. The agent submits the proof to `fundAdvanceFromQuery`. The contract
   independently re-verifies the proof, decodes the transaction, matches the
   registered invoice and buyer, and runs the on-chain policy gate.
6. Within policy limits, the advance is funded automatically. Over-limit
   requests enter the guardian confirmation path.
7. On repayment, a distinct `RepaymentConfirmed` event is proven through the
   same Block Prover trust boundary before `acknowledgeRepaymentFromQuery`
   updates repayment-driven reputation.

## Core Technology

**Where AI ends and enforcement begins.** The off-chain policy check is a
pure, side-effect-free mirror intended to save gas and surface review before
a proof submission. The irreversible decision happens inside
`AttestGuardManager.sol`, using on-chain registered amounts and caps. A
compromised agent cannot construct a call that skips the gate.

**The LLM's authority is zero.** `explain.ts` and `underwriter.ts` are the
only LLM call sites. `explain.ts` receives an already-determined outcome and
produces a human-readable explanation. `underwriter.ts` receives structured
evidence and produces an advisory proposal that is strictly validated and
bounded by deterministic rules. Neither component has funding or
authorization power. Neither can override the contract's policy gate.

**Bounded AI underwriting v1.** The underwriter emits a fixed-version proposal
containing a recommended advance, risk tier, confidence, reason codes, risk
flags, model metadata, timestamp and an evidence hash. Unsafe numeric values,
unknown reason codes, invalid confidence values and malformed responses fall
back safely. Recommendations above the deterministic envelope are capped and
flagged for review. Missing proof or delivery verification forces zero
recommendation and elevated risk.

**Reputation as an earned primitive.** Supplier auto-approve capacity can grow
from verified repayment history. `acknowledgeRepaymentFromQuery` requires a
proof of the distinct `RepaymentConfirmed` source-chain event, verifies it
through the Block Prover, checks the repayment amount, and uses replay
protection. The old owner-attested repayment path is no longer the active
architecture; ADR-0005 is retained only as the historical record of that gap.

**Defense in depth on the funding path.** `nonReentrant` protects fund-moving
functions, `Pausable` provides a circuit breaker, replay protection prevents
re-use of the same verified query, and a hard global ceiling cannot be
bypassed by a per-supplier cap.

## Security Model

Full technical detail lives in [SECURITY.md](./SECURITY.md).

**What Attestcoin Protocol guarantees:** the source-chain event really
happened, verified via Merkle inclusion and continuity proofs against
Creditcoin's Block Prover infrastructure. The off-chain agent is not the
source of truth for that fact.

**What it does not guarantee:** that the invoice itself represents a genuine
business relationship. `registerAdvance` remains owner-controlled in the
current version. Attestcoin proves the registered source-chain event; it does
not independently perform KYC, invoice underwriting, or business-relationship
validation.

**What repayment verification guarantees:** repayment-driven reputation is
now based on a distinct, proof-gated `RepaymentConfirmed` event rather than an
owner-only assertion. The repayment query is independently verified and
amount-checked before the reputation update.

**What remains centralized:** invoice registration and pooled liquidity
withdrawal remain explicit owner trust boundaries. Production deployments
would require stronger onboarding and depositor accounting than the hackathon
testnet scope.

## Use Cases

**A small textile supplier, first-time relationship.** The first advance for
a buyer relationship is conservatively routed for review rather than silently
assuming a long repayment history. Verified history can inform future
underwriting.

**A recurring supplier-buyer pair with a repayment track record.** Verified
`RepaymentConfirmed` events contribute to the relationship evidence and
supplier reputation without requiring an owner to simply assert that repayment
occurred.

**A lender/liquidity provider.** Deposits testnet liquidity into the vault
while deterministic policy controls advance releases. The current owner-only
withdrawal model is documented and is not presented as production-grade
third-party depositor accounting.

**A guardian/risk reviewer.** Sees cases escalated by deterministic policy or
bounded underwriting rather than having to manually review every routine
transaction.

## Roadmap

**Shipped in code:** Attestcoin-verified funding, on-chain guardrail policy,
human-confirmation path, proof-gated repayment, bounded AI underwriting v1,
evidence hashing, monotonic review routing, and verified buyer/supplier
history indexing in the off-chain agent.

**Next:** fresh public-testnet deployment of the current contract revision,
with the resulting addresses and repayment transaction evidence recorded only
after the deployment is actually exercised. Add stronger supplier/buyer
onboarding with staking or KYC-style controls to reduce the invoice-registration
trust boundary.

**Later:** multi-source-chain support, a hosted guardian dashboard, and a
reusable policy-gate primitive parameterized by event type.

## Future Research Directions

The advisory-AI / unbypassable-policy split is not specific to trade finance.
A model can propose and explain while an immutable policy independently decides
what an irreversible action is allowed to do. Generalizing that primitive to
insurance, escrow, supply-chain and compliance workflows is the natural next
research direction after real usage data exists.

## Conclusion

The credible claim is not that AI or blockchain magically removes every trust
assumption from finance. AttestGuard explicitly retains owner-controlled
invoice registration and pooled-vault administration. What it demonstrates is
narrower and stronger: an AI agent can operate a financial workflow because
its inputs are cryptographically verified, its recommendations are bounded,
and the irreversible funding decision is enforced independently by smart
contracts. Repayment-driven reputation now follows the same proof-gated
principle rather than relying on an owner assertion.
