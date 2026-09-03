# ADR-0006: Repayment is now proof-gated, closing ADR-0005's disclosed gap

## Status

Accepted and implemented (v3).

## Context

ADR-0005 shipped v2 with acknowledgeRepayment as a plain onlyOwner call
and disclosed, rather than hid, the resulting inconsistency: funding was
cryptographically verified, repayment acknowledgment was not, so
autoApproveCap growth ("reputation") was really owner-attested
bookkeeping wearing the name "verified reputation." That ADR named the fix
explicitly as the highest-priority next piece of work.

## Decision

Added a second proof-gated entry point, acknowledgeRepaymentFromQuery,
following the exact same pattern as fundAdvanceFromQuery:

1. TradeConfirmation.sol (source chain) gained a second function,
   confirmRepayment(invoiceId, supplier, amount), emitting a distinct
   RepaymentConfirmed event - not reusing DeliveryConfirmed, so the two
   event types can never be confused with each other during verification.
2. AttestGuardManager.sol verifies the same Merkle inclusion +
   continuity proof via the Block Prover precompile, decodes the
   transaction via EvmV1Decoder, and matches a RepaymentConfirmed log
   against the invoice's invoiceId and buyer - mirroring
   _validateDeliveryEvent's pattern in a new _validateRepaymentEvent.
3. Unlike delivery confirmation (where the event's own amount/supplier
   fields are deliberately ignored in favor of the registered advance's
   values - see SECURITY.md), the repayment path does check the
   event's amount against requestedAdvanceAmount and reverts
   (RepaymentAmountTooLow) if it's short. This is a deliberate,
   different design choice: the whole point of the repayment leg is
   confirming enough money actually came back, so unlike funding (where
   the amount is a policy decision made before any proof exists),
   under-verifying the amount here would defeat the feature's purpose.
4. acknowledgeRepaymentFromQuery reuses the same processedQueries
   replay-protection mapping as funding - one shared keyspace, not two,
   since a (chainKey, blockHeight, txIndex) tuple already uniquely
   identifies one real source-chain transaction regardless of which event
   type is later checked in the tx's logs.
5. acknowledgeRepaymentFromQuery is deliberately not onlyOwner - any
   address can call it, because the proof is what authorizes the state
   change, not the caller. This mirrors fundAdvanceFromQuery, which has
   the same property, and is a meaningful decentralization improvement
   over the old owner-gated version: the owner no longer has to
   personally be the one who notices and submits every repayment.

## Testing

contracts-test/AttestGuardManager.repayment.e2e.test.ts (11 tests, using
the same MockNativeQueryVerifier-at-the-precompile-address technique as
the funding e2e suite) covers: the happy path including the
autoApproveCap increase; an invoice that was never funded; a repayment
short of the advanced amount; the exact-amount boundary; a buyer mismatch;
a reverted underlying transaction; a DeliveryConfirmed-shaped log
deliberately rejected as a repayment proof (regression test against event-
signature confusion); replay protection across two different invoices
sharing a proof root (two variants); the Pausable circuit breaker; and
rejection of a second, distinct proof attempting to re-acknowledge an
already-Repaid invoice. All 28 Solidity tests (17 pre-existing plus 11
new) pass via a real npx hardhat test run.

## Consequences

**Positive:** autoApproveCap growth is now backed by the same class of
guarantee as funding itself - closing the one inconsistency ADR-0005
named. The word "reputation" in the README/whitepaper is now accurate
rather than aspirational.

**Negative / still open:** this closes the repayment-verification gap
specifically. It does not touch the separate, still-open trust boundary
from ADR-0003 (invoice registration is still onlyOwner - proof of a
delivery or repayment event is not proof that the underlying invoice was
a legitimate business relationship in the first place). That remains
accurately disclosed in SECURITY.md as a distinct, deliberate scope
boundary, not something this ADR claims to have fixed.
