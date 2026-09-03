# ADR-0005: acknowledgeRepayment remains owner-attested (historical gap)

## Status

**Superseded by [ADR-0006](0006-verified-repayment.md).** Kept in full below for the historical record of why the gap existed and what closing it required — the reasoning remains useful even though the gap itself is now closed.

## Context

The reputation mechanism (a supplier's `autoApproveCap` growing over time)
is only as trustworthy as the event that triggers it. Funding itself is
gated on a real, Attestcoin-verified proof (see `fundAdvanceFromQuery`).
Repayment acknowledgment (`acknowledgeRepayment`) was not: it was a plain
`onlyOwner` call with no proof requirement, meaning the owner's word was the
source of truth for "this supplier paid back what they owed."

This was inconsistent with the rest of the system's design philosophy, and
that inconsistency was worth naming explicitly rather than letting the word
"reputation" imply a stronger guarantee than was actually enforced.

## Decision

Ship the earlier v2 revision with this limitation stated plainly in
`SECURITY.md`, `WHITEPAPER.md`, and the pitch materials, rather than either
(a) hiding it or (b) blocking the v2 release on building a full
repayment-proof flow under time pressure, which risked shipping something
rushed and unreviewed instead of something honestly incomplete.

## Consequences

**Positive:** anyone evaluating the earlier version — a judge, an auditor, a
future contributor — gets an accurate picture of exactly which guarantees
were cryptographically enforced at that point versus which were still an
admin trust assumption. That's a more useful (and more credible) thing to
hand someone than a system that claims more than it delivers.

**Negative:** until this gap was closed, `autoApproveCap` growth was not
actually the trustless, on-chain-verified signal the word "reputation"
suggested it should be. It was owner-attested bookkeeping for that version.

## Path to resolution

The natural fix was to mirror `fundAdvanceFromQuery`: require a proof of a
repayment-confirmation event (analogous to `DeliveryConfirmed`) on a source
chain, verified the same way, before repayment acknowledgment can execute.
That required a source-chain repayment contract analogous to
`TradeConfirmation.sol` and was identified as the next concrete piece of
work.

That path was completed in **ADR-0006**: `acknowledgeRepaymentFromQuery`
now verifies a distinct `RepaymentConfirmed` event through the Block Prover
before applying repayment-driven reputation changes. The old
`acknowledgeRepayment` path is no longer the active architecture.
