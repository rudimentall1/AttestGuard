# ADR-0001: Deterministic on-chain policy gate, not AI-scored funding decisions

## Status

Accepted (v1, unchanged in v2).

## Context

The obvious way to decide "should this advance be funded right now" is to
have an AI agent evaluate the situation - buyer history, amount, timing -
and output a risk score or a yes/no. This is also the pattern most
"AI agent security" projects in this space actually ship, including an
earlier project in this author's own portfolio (Agentic Wallet Guardian),
where an external audit found that the "risk scoring" was, in practice,
built on mock data rather than real signals - a gap between the pitch and
the code that is worse for credibility than an honest limitation.

## Decision

The funding decision is made by a deterministic function
(`_applyPolicyAndMaybeFund` in `AttestGuardManager.sol`) whose only inputs
are on-chain state: the registered advance amount, the supplier's current
auto-approve cap, and today's already-funded total for that supplier. No
AI model, statistical score, or off-chain judgment call is anywhere in
this function's call path.

The off-chain agent's own policy pre-check (`offchain-agent/src/policy.ts`)
exists only to avoid spending gas on a proof submission the contract would
reject anyway. It is explicitly documented as non-authoritative and cannot
itself move funds.

## Consequences

**Positive:** the funding decision is fully auditable from chain state
alone, reproducible by anyone re-running the same inputs, and cannot
silently change behavior based on a model update, a prompt change, or an
off-chain data source going stale or being manipulated.

**Negative:** the policy is necessarily simpler than what a learned model
could in principle express - it can't weigh subtle, hard-to-formalize
signals the way a risk model might. This is treated as an acceptable
trade: a policy that's simple enough to fully understand and audit for a
first version.

## Alternatives considered

**LLM-scored risk with a confidence threshold.** Rejected: reintroduces
exactly the auditability and manipulability problems this project exists
to avoid, and repeats a mistake already made and documented in a prior
project.

**Off-chain policy engine with on-chain execution only.** Rejected: this
would make the off-chain agent authoritative, meaning a compromised or
buggy agent could force a bad outcome through - the entire point of
putting the gate on-chain is that it can't be that.
