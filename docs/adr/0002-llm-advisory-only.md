# ADR-0002: LLM output is advisory-only, with zero path to moving funds

## Status

Accepted.

## Context

Once a deterministic policy gate exists (see ADR-0001), there is still a
temptation to let an LLM "double-check" or "explain and potentially
override" the verdict for edge cases - it seems like a reasonable safety
net. It is also exactly the kind of surface that prompt-injection and
agent-hijacking attacks target: if an LLM's output can influence whether
money moves, then anything that can influence the LLM's output (a crafted
invoice note, a manipulated dashboard field, a compromised upstream data
source) becomes an attack vector against the funding decision itself.

## Decision

`offchain-agent/src/explain.ts` is the only place in the codebase that
calls an LLM. It is invoked strictly *after* the deterministic verdict has
already been computed, and its sole job is to produce a human-readable
explanation string for a dashboard. Its return value is never read by any
code path that calls the contract or influences `policy.ts`'s verdict. If
the LLM call fails, times out, or is disabled entirely (no API key), a
template string is used instead and everything else proceeds identically.

## Consequences

**Positive:** there is no prompt for an attacker to inject that would
change what money does, because the component that talks to an LLM has no
authority over money. This is a structural guarantee, not a policy one -
it holds even if the LLM is replaced, misconfigured, or compromised.

**Negative:** the system doesn't benefit from any genuinely useful
judgment an LLM might have contributed to edge cases the deterministic
policy handles bluntly (e.g., a first-time buyer relationship that's
obviously legitimate context but gets the same "flag for review" treatment
as one that isn't). This is accepted as the correct trade for a financial
system: predictability and auditability over marginal decision quality.

## Alternatives considered

**LLM as a second opinion that can escalate (not override) to WARN.**
Considered and rejected for v1: even an escalate-only path means the LLM's
output changes system behavior, which reopens the injection surface this
ADR exists to close. Could be revisited later with careful scoping (e.g.,
the LLM can only ever make a decision *more* conservative, never less),
but is not in the current design.
