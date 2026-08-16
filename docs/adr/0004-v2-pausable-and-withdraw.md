# ADR-0004: Add a Pausable circuit breaker and withdrawLiquidity in v2

## Status

Accepted and deployed (v2).

## Context

v1 of `AttestGuardManager` had no way to halt fund-moving operations after
deployment short of the owner simply refusing to register new advances -
which would not stop an already-registered advance with a valid proof
from still being funded if a policy bug were discovered. It also had no
way to return liquidity deposited via `depositLiquidity` if it was never
drawn down by a funded advance; funds could enter the vault but only ever
leave it through the funding path. Both gaps were identified in an
external-style security review before the v2 deployment and are logged in
`SECURITY.md`.

## Decision

Added `pause()` / `unpause()` (`onlyOwner`, backed by OpenZeppelin's
`Pausable`) with `whenNotPaused` on `fundAdvanceFromQuery` and
`confirmPendingAdvance` specifically - the two functions that move funds
out of the vault. `registerAdvance`, `rejectPendingAdvance`, and all view
functions are deliberately NOT gated by pause, so the system can keep
accepting new registrations and rejecting bad ones while an incident is
being investigated - pause stops money movement, not the whole contract.

Added `withdrawLiquidity(uint256 amount)` (`onlyOwner`), a plain transfer
back to the caller from the vault's token balance.

## Consequences

**Positive:** a policy bug found after deployment has a real, immediate
mitigation that doesn't require redeploying or abandoning in-flight
registrations. Deposited liquidity is no longer a one-way door.

**Negative:** `withdrawLiquidity` is intentionally unrestricted beyond
`onlyOwner` - there is no per-depositor accounting, so it trusts the owner
the same way deposits already do. This is acceptable for pooled
demo/testnet liquidity; a production deployment with third-party liquidity
providers would need real depositor-share accounting, which is out of
scope for this version and noted as such rather than silently assumed
away.

## Alternatives considered

**Timelock on owner actions instead of a pause switch.** Would slow down
an attacker but also slows down a legitimate incident response, which is
the opposite of what a circuit breaker is for. A timelock is a reasonable
addition for governance-style actions (e.g., changing `globalMaxAdvance`)
in a later version, but not a substitute for an immediate pause on fund
movement specifically.
