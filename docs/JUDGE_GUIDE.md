# AttestGuard judge guide

## What the system does

AttestGuard is a trade-finance advance flow where a source-chain delivery event is proved through Attestcoin before Creditcoin can release funds.

The important part is the boundary between AI and money:

1. A buyer confirms delivery on the source chain.
2. Attestcoin provides a cryptographic proof of the source-chain transaction.
3. The off-chain agent reads the verified event and supplier/buyer history.
4. Bounded AI produces underwriting metadata.
5. The AI result is validated and constrained by a deterministic evidence envelope.
6. `AttestGuardManager.sol` verifies the proof again and applies the final funding policy on-chain.
7. Only the contract can release funds.

The LLM cannot call a funding primitive, raise a cap, bypass a block, or mark a repayment as verified.

## Security invariants

These are the properties the implementation is designed to preserve:

- **No proof, no funding.** `fundAdvanceFromQuery` requires a valid Attestcoin proof.
- **Wrong source contract, no funding.** The proven log must come from the owner-registered source confirmation contract.
- **Wrong invoice, buyer, supplier, or invoice amount, no funding.** The delivery event is bound to the registered advance.
- **AI cannot authorize money.** The contract funds the registered `requestedAdvanceAmount`, not an LLM recommendation.
- **Global maximum is absolute.** Guardian confirmation can override supplier auto-approval and daily caps, but not `globalMaxAdvance`.
- **Repayment reputation is proof-gated.** Supplier capacity increases only after a separately verified `RepaymentConfirmed` event.
- **Wrong repayment supplier, no reputation increase.** Repayment evidence is bound to the registered supplier and buyer.
- **Replay is rejected.** A source chain key + block height + transaction index can only be processed once.
- **Weak evidence cannot receive an optimistic AI tier.** The deterministic underwriting floor forces risk tier C or D for incomplete/new or defaulted relationships.
- **Verification failure fails closed.** Missing delivery/proof verification produces a zero recommendation and elevated risk instead of a permissive result.

## AI boundary

The AI layer is deliberately bounded.

The model can propose:

- a risk tier;
- a recommended advance amount;
- confidence;
- reason codes;
- risk flags.

The model cannot change the verified facts. The evidence hash covers the request, identities, invoice amount, requested amount, supplier limits, funding state, buyer relationship history, repayment/default history, history completeness, and verification state used by the bounded decision.

A deterministic envelope then caps the proposed amount and applies the minimum risk tier implied by the evidence.

## Main adversarial cases covered by tests

- AI proposes tier A despite no repayment history.
- AI proposes tier A despite incomplete/new relationship history.
- AI proposes tier A after a prior default.
- AI proposes an amount above the deterministic cap.
- AI returns malformed JSON, unsafe numbers, invalid confidence, or unknown reason codes.
- Delivery proof uses the wrong supplier.
- Delivery proof uses the wrong invoice amount.
- Repayment proof uses the wrong supplier or buyer.
- Repayment amount is below the requested advance.
- A verified proof is replayed.
- A funding request exceeds the global maximum.
- A pending guardian approval attempts to override the global maximum.

## Demo flow

Use the existing real-testnet deployment for the currently documented funding demo. Do not describe the newer proof-gated repayment code as deployed at that address until a fresh deployment is performed.

Recommended five-minute demo:

1. Show a registered 1,000 aUSD invoice with a 300 aUSD requested advance.
2. Show the buyer's `DeliveryConfirmed` transaction on Sepolia.
3. Show the Attestcoin proof being used by `fundAdvanceFromQuery` on Creditcoin.
4. Show the manager decoding and binding the proven delivery event, then auto-funding within the deterministic caps.
5. Show a second request above the supplier auto-approve cap becoming `PendingConfirmation` and being released only through the guardian path.
6. Show a repayment proof and the supplier cap increasing only after the `RepaymentConfirmed` event is independently verified.
7. Point to the tests for wrong supplier, wrong amount, replay, weak AI evidence, and global-max enforcement.

## What is intentionally trusted

`registerAdvance` remains `onlyOwner` in this hackathon version. The owner therefore asserts the initial invoice, supplier, buyer, and amounts. This is an explicit trust boundary, not something Attestcoin magically removes.

The source-chain contract is also an application-level trust boundary: Attestcoin proves that the pinned contract emitted the event, not that the physical goods existed in the real world.

## Current status

CI on `main` is green after the bounded-underwriting merge. The repository contains real Hardhat compilation/tests and off-chain TypeScript tests. The live deployment documented in `README.md` is the older v2 funding deployment; newer repayment and buyer-history code should only be called live after a fresh deployment and on-chain verification.
