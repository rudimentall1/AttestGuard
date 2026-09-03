# Security

## Reporting a vulnerability

This is a hackathon-stage project on testnet only — no mainnet funds are at
risk. If you find a real issue, open a GitHub issue or reach out directly;
there's no bug bounty program at this stage.

## Threat model, stated plainly

AttestGuard has several independent trust boundaries. Understanding each is
necessary to evaluate what the system actually guarantees.

### 1. What the Attestcoin Protocol guarantees

`AttestGuardManager.fundAdvanceFromQuery` only accepts a `DeliveryConfirmed`
event if the Block Prover precompile (`0x0FD2`) verifies a real Merkle
inclusion + continuity proof for it. This means: **the event really happened,
on the real source chain, in a real mined transaction.** No off-chain agent,
no oracle operator, and no owner action can forge that proof — it is checked
by Creditcoin's own proof infrastructure, not by this contract's code alone.

What it does NOT guarantee: that the address which triggered the event is who
your business process expects, or that the event was economically meaningful.
A party could deploy its own contract that emits a similarly shaped event.
That's why `sourceConfirmationContract` pins the manager to one
owner-registered source contract rather than accepting any contract with the
same ABI.

### 2. What the on-chain guardrail policy guarantees

Even given a genuinely verified event, `_applyPolicyAndMaybeFund`
independently re-derives whether funding is appropriate: per-advance cap,
per-supplier daily cap, global maximum, and the pending-confirmation path.
This is enforced in the contract itself, so a compromised or buggy off-chain
agent cannot force a bad advance through by changing its local policy result.

### 3. What the bounded AI layer guarantees — and does not

The AI/LLM layer is **advisory evidence, never authorization**.

- `underwriter.ts` validates structured model output against a strict schema.
- Security-relevant evidence is hashed before the proposal is accepted.
- Unsafe numeric values, invalid confidence values, unknown reason codes and
  malformed responses fail back safely.
- The recommended amount is bounded by a deterministic envelope derived from
  invoice value and on-chain policy limits.
- Missing delivery/proof verification forces a zero recommendation and
  elevated risk.
- `routing.ts` is monotonic: AI can escalate review but cannot weaken a
  deterministic `BLOCK` or `WARN` result.
- `explain.ts` only turns an already-determined result into human-readable
  text.

Neither LLM call site can authorize or directly move funds. The authoritative
funding decision remains `AttestGuardManager.sol`.

### 4. What proof-gated repayment guarantees

Repayment-driven reputation no longer relies on the old owner-attested
`acknowledgeRepayment` path. `acknowledgeRepaymentFromQuery` mirrors the
funding proof boundary: it verifies a distinct source-chain
`RepaymentConfirmed` event through the Block Prover, decodes the proven
transaction, checks the invoice/supplier relationship and verifies that the
repaid amount is sufficient for the requested advance before updating
reputation.

The repayment proof path is intentionally not `onlyOwner`. Replay protection
uses the same `processedQueries` keyspace as funding. See
`docs/adr/0006-verified-repayment.md` for the full design record.

### 5. What is currently NOT decentralized (by design, at this stage)

- **`registerAdvance` is `onlyOwner`.** The deployer's key decides which
  invoices exist at all — supplier, buyer and amounts are owner-asserted at
  registration time. Attestcoin later confirms that the registered buyer
  address really produced the proven source-chain event; it does not
  independently confirm that the underlying invoice or business relationship
  is legitimate. Supplier/buyer self-registration with staking or KYC-style
  onboarding is roadmap work.
- **`withdrawLiquidity` is owner-controlled.** The v2 circuit breaker and
  withdrawal path provide an operational escape hatch for pooled testnet
  liquidity, but there is no per-depositor share accounting. A production
  deployment with third-party liquidity providers would require explicit
  depositor accounting.
- **Source-event semantics remain application-specific.** Attestcoin proves
  that the pinned source contract emitted the event; it does not prove that a
  real-world delivery actually occurred outside the source chain. A
  production system would need stronger business-process controls around
  who may call the source contract.

### 6. Historical testnet key exposure and rotation

The original deployer key was exposed during development. The documented
response was to rotate the contract owner and `guardianConfirmer` to fresh
keys.

The repository does **not** make independently verified claims here about the
exact leak vector, whether the exposed key was used before rotation, or
whether repository history was rewritten. Those details are intentionally
not guessed or presented as facts.

The old key must be treated as compromised and must never be reused. All
testnet deployment/demo keys should be treated as burner keys and replaced
before any deployment holding real value.

## Key hygiene note

Wallets used for testnet deployment and demo scripts in this repository
should be treated as burner keys — generate fresh ones for anything beyond
throwaway testnet demonstration, never commit private keys, and never reuse a
demo/testnet private key for anything holding real value.
