# ADR-0005: acknowledgeRepayment remains owner-attested (known gap, not hidden)

## Status

Accepted as a known limitation for the current version. Highest-priority
item in the roadmap to close.

## Context

The reputation mechanism (a supplier's `autoApproveCap` growing over time)
is only as trustworthy as the event that triggers it. Funding itself is
gated on a real, Attestcoin-verified proof (see `fundAdvanceFromQuery`).
Repayment acknowledgment (`acknowledgeRepayment`) is not: it's a plain
`onlyOwner` call with no proof requirement, meaning the owner's word is
currently the source of truth for "this supplier paid back what they
owed."

This is inconsistent with the rest of the system's design philosophy, and
that inconsistency is worth naming explicitly rather than letting the
word "reputation" imply a stronger guarantee than what's actually
enforced.

## Decision

Ship v2 with this limitation stated plainly in `SECURITY.md`,
`WHITEPAPER.md`, and the pitch materials, rather than either (a) hiding it
or (b) blocking the v2 release on building a full repayment-proof flow
under time pressure, which risks shipping something rushed and unreviewed
instead of something honestly incomplete.

## Consequences

**Positive:** anyone evaluating this system - a judge, an auditor, a
future contributor - gets an accurate picture of exactly which guarantees
are cryptographically enforced today versus which are still an admin
trust assumption. That's a more useful (and more credible) thing to hand
someone than a system that claims more than it delivers.

**Negative:** until this is closed, `autoApproveCap` growth is not
actually the trustless, on-chain-verified signal the word "reputation"
suggests it should be. Treat it as owner-attested bookkeeping for now.

## Path to resolution

The natural fix mirrors `fundAdvanceFromQuery`: require a proof of a
repayment-confirmation event (analogous to `DeliveryConfirmed`) on a
source chain, verified the same way, before `acknowledgeRepayment` can
execute. This requires a source-chain repayment contract analogous to
`TradeConfirmation.sol` and is scoped as the next concrete piece of work
after the current test/documentation pass, not a someday item.
