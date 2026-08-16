# ADR-0003: Invoice registration is owner-controlled, not permissionless

## Status

Accepted for the current scope; flagged as a roadmap item to reduce (see
"Alternatives considered").

## Context

The Attestcoin Protocol proves that a source-chain event really happened.
It does not, and cannot, prove that the invoice being financed represents
a real business relationship between a real supplier and a real buyer -
that is a claim about the world, not about a blockchain state, and no
cryptographic proof of an on-chain event can establish it. Something has
to be trusted to assert "this invoice is legitimate" before the system
does anything with it.

## Decision

`registerAdvance` is restricted to the contract owner. Only the owner can
create the initial `Registered` state an advance needs before Attestcoin
proofs and the policy gate ever come into play. This is a deliberate,
disclosed centralization point, not an oversight - see `SECURITY.md` for
the full write-up aimed at anyone evaluating trust boundaries.

## Consequences

**Positive:** the parts of the system that genuinely don't need a trusted
party (event verification, policy enforcement) don't have one. The one
part that does need a trust decision - is this invoice real - has an
explicit, single, auditable actor responsible for it, rather than a vague
or implicit trust assumption buried in documentation nobody reads.

**Negative:** the system's overall trustworthiness is bounded by the
owner's judgment and key security for this one function, no matter how
strong the cryptographic guarantees are downstream of it. A compromised
owner key could register illegitimate invoices (though it still could not
fund them without a real, matching, Attestcoin-verified event from the
exact registered buyer address - see `AttestGuardManager.sol`'s
`_validateDeliveryEvent`).

## Alternatives considered

**Permissionless registration with staking.** Any address could register
an advance by staking collateral, slashed if the invoice turns out
fraudulent. Rejected for the current version because a fair slashing
mechanism needs a dispute-resolution process this project doesn't yet
have; documented as a "Next" roadmap item rather than shipped half-built.

**KYC-gated registrant allowlist.** Multiple trusted registrants instead
of a single owner. Reduces (doesn't remove) the centralization, adds
real operational complexity (who administers the allowlist, and how is
that itself not just the same trust problem one layer up). Deferred to
a later iteration once there's real usage data to justify the complexity.
