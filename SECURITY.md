# Security

## Reporting a vulnerability

This is a hackathon-stage project on testnet only — no mainnet funds are at
risk. If you find a real issue, open a GitHub issue or reach out directly;
there's no bug bounty program at this stage.

## Threat model, stated plainly

AttestGuard has two independent trust boundaries. Understanding both is
necessary to evaluate what the system actually guarantees.

### 1. What the Attestcoin Protocol guarantees

`AttestGuardManager.fundAdvanceFromQuery` only accepts a `DeliveryConfirmed`
event if the Block Prover precompile (`0x0FD2`) verifies a real Merkle
inclusion + continuity proof for it. This means: **the event really
happened, on the real source chain, in a real mined transaction.** No
off-chain agent, no oracle operator, and no owner action can forge this —
it is checked by Creditcoin's own consensus-adjacent infrastructure, not by
this contract's code.

What it does NOT guarantee: that the address which triggered the event is
who your business process expects it to be, or that the event was
economically meaningful (e.g. someone could deploy their own
`TradeConfirmation`-shaped contract and confirm "delivery" of nothing).
That's why `sourceConfirmationContract` (`AttestGuardManager.sol:54`) pins
the manager to trust events from exactly one, owner-registered contract —
not any contract shaped like it.

### 2. What the on-chain guardrail policy guarantees

Even given a genuinely verified event, `_applyPolicyAndMaybeFund`
(`AttestGuardManager.sol:266`) independently re-derives whether funding is
appropriate: per-advance cap, per-supplier daily cap, global max. This is
enforced in the contract itself, so a compromised or buggy off-chain agent
can at worst fail to submit a good advance — it cannot force a bad one
through.

### 3. What is currently NOT decentralized (by design, at this stage)

- **`registerAdvance` is `onlyOwner`.** The deployer's key decides which
  invoices exist at all — supplier, buyer, and amounts are entirely
  owner-asserted at registration time. The Attestcoin proof later confirms
  that the registered *buyer address* really sent a `DeliveryConfirmed`
  transaction — it does not independently confirm that the underlying
  invoice or business relationship is real. In other words: Attestcoin
  Protocol removes the need for an oracle to attest *that an event
  happened*; it does not, on its own, remove the need for someone trusted
  to assert *that an invoice is legitimate* in the first place. Closing
  that gap (e.g. supplier/buyer self-registration with staking, or
  KYC-gated onboarding) is roadmap, not shipped.
- **`acknowledgeRepayment` is `onlyOwner`**, not gated by a verified proof
  of the buyer's actual repayment (`AttestGuardManager.sol:326`). The
  reputation mechanism (auto-approve cap growth) currently trusts the
  owner's word about repayment having happened. This is stated in the
  function's own NatSpec comment. Treat "reputation earned from verified
  history" as aspirational until this is proof-gated too.
- **The `DeliveryConfirmed` event's `supplier` and `amount` fields are not
  cross-checked** against the registered advance
  (`AttestGuardManager.sol:237-260` only checks `invoiceId` and `buyer`
  from the event topics). Funding always uses the amount and supplier from
  the *registered* advance, never from the event data — so this isn't
  exploitable, but a reviewer will reasonably ask why those fields exist
  unchecked, so it's documented here explicitly rather than left for
  someone to discover.
- **No `Pausable` circuit breaker and no vault withdrawal path.** If a
  policy bug were found post-deployment, there is currently no way to halt
  `fundAdvanceFromQuery` short of the owner refusing to register new
  advances (already-registered ones with a valid proof could still be
  funded). Liquidity deposited via `depositLiquidity` also has no return
  path if never drawn down. Both are planned for the next contract
  revision — see the repository roadmap.

## Key hygiene note

Wallets used for testnet deployment and demo scripts in this repository
should be treated as burner keys — generate fresh ones for anything beyond
throwaway testnet demonstration, and never reuse a demo/testnet private key
for anything holding real value.
