# AttestGuard

**AI-agent-gated trade-finance advances on Creditcoin — funded the instant a
cross-chain event is *cryptographically verified*, never on an oracle's word
and never on an AI agent's unchecked say-so.**

Full technical whitepaper: WHITEPAPER.md  
Pitch deck: docs/AttestGuard-Pitch-Deck.pptx  
Architecture decision records: docs/adr/  
Demo video: https://youtu.be/rvXKUgTfpWc

Built for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) —
primary track **AI**, with direct crossover into **RWA** and **DeFi**
(invoice/trade-finance advances are real-world-asset financing by
definition).

---

## The 30-second pitch

A supplier ships goods to a buyer against an invoice. Normally they wait 30-90
days to get paid, or pay a factoring desk a fat discount for early cash — and
that desk still needs someone to manually check that delivery actually
happened before wiring money.

AttestGuard replaces the manual check with the **Attestcoin Protocol**:
Creditcoin's native ability to cryptographically verify that an event really
happened on another chain, with no centralized oracle operator in the loop.
The moment a buyer confirms delivery on-chain (on any EVM chain — Ethereum
Sepolia in this demo), an AI agent notices, fetches a proof, and prepares the
advance flow — but payout only happens if it also clears a **deterministic,
on-chain guardrail policy** (per-supplier caps, daily limits, human
confirmation above a threshold) that the agent itself cannot bypass.

```
Buyer confirms delivery         Attestcoin Protocol            AttestGuardManager.sol
   on source chain      ---->   proves it happened      --->   (on Creditcoin)
  (TradeConfirmation.sol)       (no oracle operator)            |
                                                                 |-- within caps? --> auto-fund
                                                                 |-- over cap?    --> flag for
                                                                 |                     human guardian
                                                                 |-- repaid?      --> raise cap
                                                                        (only from
                                                                         verified repayment)
```

## Why this, why now, why us

This project is a direct, honest pivot from two earlier projects in this
author's portfolio — **Agentic Wallet Guardian** and **Agent Guardrail** —
both about letting AI agents take autonomous action safely. The first leaned
on wallet/contract "risk scores" that, under an outside audit, turned out to
still be backed by placeholder data rather than real signals. The second
fixed that by committing to deterministic, unbypassable enforcement instead
of AI judgment calls — but had no real external data source to act on yet.

**AttestGuard is what you get when you point that lesson at Creditcoin's own
infrastructure.** The Attestcoin Protocol is the missing "real data" half:
cryptographically verified cross-chain events instead of an API response you
have to trust. The guardrail-policy half — deterministic caps, human
confirmation above a threshold, and reputation driven by **proof-gated
repayment history**, never from an LLM's opinion — is the safety half. Put
together, you get an AI agent that can operate a financial workflow because
every individual release is checked by something stronger than itself:
cryptography on the input side, immutable contract logic on the output side.

## What's real right now, honestly

Following the same standard applied to this author's earlier projects — say
plainly what's built versus what's roadmap, because judges (rightly) punish
the gap between the pitch and the code more than they punish an honest TODO:

| Component | Status |
|---|---|
| AttestGuardManager.sol (v2) - full on-chain policy gate plus Pausable circuit breaker and withdrawLiquidity | Deployed on Creditcoin CC3 testnet; real Hardhat/chai tests passing |
| TradeConfirmation.sol - source-chain event emitter | Deployed on Sepolia |
| Proof-gated repayment (`acknowledgeRepaymentFromQuery`) | Implemented; distinct `RepaymentConfirmed` event verified through Creditcoin's Block Prover; see ADR-0006 |
| Verified buyer/supplier history index | Implemented in the off-chain agent; reads `AdvanceRegistered` and proof-gated `RepaymentAcknowledged` history; advisory evidence only |
| Bounded AI underwriting v1 | Implemented; structured model output is validated, evidence-hashed, deterministically capped, and cannot authorize funding |
| Off-chain policy pre-check (policy.ts) | 8/8 unit tests passing - real assertions, real bugs already caught and fixed during writing |
| LLM risk-note / underwriting layer | Calls the real Anthropic Messages API when a key is present; deterministic fallback otherwise; never has funding authority |
| Off-chain worker (worker.ts) - event watcher, proof fetch/retry loop, submission | Written and typechecks against the real @gluwa/usc-sdk API |
| Full end-to-end flow: Sepolia event -> Attestcoin proof -> on-chain policy gate -> funds moved | Done, live, on real testnets for the deployed v2 flow. See Live deployment below. |

### Live deployment

Deployed and exercised end-to-end on real public testnets — every address
and transaction hash below is independently verifiable on-chain. These
addresses describe the currently documented **v2 deployment**; the newer
proof-gated repayment code must not be represented as deployed there until a
fresh deployment is actually performed and its address is recorded.

**Creditcoin CC3 testnet**
- AttestGuardManager: 0x0713C48b27CddAb1B79653A76f41703cb375E841
- EvmV1Decoder (linked library): 0xFf45387a190aAc07C5e5BDfe9C9BD1A5DfCc670d
- DemoAdvanceToken (advance payout token, "aUSD"): 0xA5027500e0AD358928dDdB04937Fdce6DCfb1d12
- Explorer: https://creditcoin-testnet.blockscout.com/address/0x0713C48b27CddAb1B79653A76f41703cb375E841

**Ethereum Sepolia (source chain)**
- TradeConfirmation: 0x8FA8Ef84036D81824A6EAab7C26A6d385c8d005F

**A real end-to-end run, no mocks, no simulation:**
1. Buyer called `confirmDelivery(...)` on Sepolia — tx 0x81e54eeb36f1b53015a028b683f39e9cbc70e063ee0bd5abb258c0bcfdc9270a.
2. Attestcoin Protocol attested the containing block and generated a Merkle + continuity proof — no oracle operator involved.
3. That proof was submitted to `AttestGuardManager.fundAdvanceFromQuery` on Creditcoin — tx 0x6066c253810355186a0815cbb3a8e01868d24d82552f12d691cacb09e8c15a3d. The contract independently re-verified the proof, decoded the real transaction bytes, matched the invoice and buyer, and checked the request (300 aUSD against a 1,000 aUSD invoice) against the on-chain guardrail policy.
4. The advance was within `DEFAULT_AUTO_APPROVE_CAP`, so it auto-funded — no human touched the funding path. Final on-chain status: Funded.

### Compilation proof

The sandbox this was built in blocks binaries.soliditylang.org (Hardhat's
compiler downloader needs it), so npx hardhat compile fails there — but the
identical Solidity was verified with real solc 0.8.23 via a standalone
solc-js script that resolves imports through the actual installed
@gluwa/usc-contracts and @openzeppelin/contracts packages. On a normal dev
machine or in CI (.github/workflows/ci.yml), run npx hardhat compile / npx
hardhat test directly — no workaround needed.

## Architecture

contracts/
  lib/VerifierInterface.sol   - Block Prover precompile interface
  src/AdvanceTypes.sol        - AdvanceRequest struct + status enum
  src/AttestGuardManager.sol  - the ASC: verifies proofs, applies the guardrail policy gate
  src/TradeConfirmation.sol   - source-chain contract buyers call to confirm delivery
  src/DemoAdvanceToken.sol    - demo ERC20 used as the payout token
  abi/                        - extracted ABIs

offchain-agent/
  src/types.ts                - shared types
  src/policy.ts               - deterministic pre-check
  src/history.ts              - verified buyer/supplier history from on-chain events
  src/underwriter.ts          - bounded AI underwriting v1
  src/routing.ts              - monotonic advisory review routing
  src/explain.ts              - optional human-readable LLM explanation
  src/worker.ts               - watches the source chain, fetches proofs, submits to Creditcoin
  test/                       - passing off-chain unit tests

deploy/                       - deployment and demo scripts
contracts-test/               - Hardhat/chai integration tests

### The core design decision

There are two different kinds of verification happening here, and keeping
them separate is the whole point:

1. Did the event really happen? Answered by the Attestcoin Protocol —
   cryptography (Merkle inclusion + continuity proofs, checked by
   Creditcoin's native Block Prover precompile), not a trusted third party.
2. Should we act on it, right now, in this amount? Answered by the
   guardrail policy in `AttestGuardManager.sol` — deterministic rules, not
   an AI agent's judgment call, and enforced on-chain so the off-chain agent
   cannot skip it.

The AI agent orchestrates the workflow and produces underwriting/explanation
metadata, but the LLM never gets a vote on whether money moves. The bounded
underwriter is constrained by validated evidence and a deterministic envelope;
review routing is monotonic, so AI recommendations can only add review, never
weaken a deterministic block or warning.

## Track fit

- **AI:** an autonomous agent processes cryptographically verified
  cross-chain data and produces bounded underwriting evidence without giving
  an LLM authorization power.
- **RWA:** invoice/trade-finance advances are financing against an accounts-
  receivable claim, released against a verified delivery event.
- **DeFi:** functionally a lending primitive — an advance is a short-duration,
  collateral-light loan against a verified future cash flow.

## Quickstart

git clone <this-repo>
cd attestguard
npm install
cp .env.example .env

npx hardhat compile
npx hardhat test
npm run deploy:manager

npm run build:agent
node --test offchain-agent/dist/offchain-agent/test/*.test.js
npm run worker

## Demo script (for the submission video)

1. Register a 1,000 aUSD invoice with a 300 aUSD requested advance.
2. Buyer confirms delivery on Sepolia.
3. Wait for Creditcoin attestation, fetch the Attestcoin proof, and submit it
   to `fundAdvanceFromQuery`. The contract re-verifies the proof and applies
   the on-chain policy.
4. Repeat with an amount above the auto-approve cap and show the advance land
   in `PendingConfirmation`, then call `confirmPendingAdvance` from the
   guardian wallet.
5. On a repayment-confirmation event, submit the proof-gated repayment query
   and show the supplier's auto-approve cap increase only after the
   `RepaymentConfirmed` proof is verified.

The worker continuously watches for new source-chain events; the demo scripts
exist because the worker's polling loop starts from "now" and won't pick up
an event that happened before it was started.

## Roadmap to a finalist-grade demo

- [x] Fund testnet wallets and deploy the manager + source-chain contract.
- [x] Full end-to-end funding run on real testnets (event -> proof -> policy
      gate -> funds moved).
- [x] Proof-gated repayment path with a distinct `RepaymentConfirmed` event,
      Block Prover verification, replay protection, and dedicated tests.
- [x] Bounded AI underwriting v1 with deterministic caps, evidence hashing,
      strict output validation, fail-closed verification, and monotonic review
      routing.
- [x] Replace placeholder buyer-relationship history with verified
      on-chain event-derived history in the off-chain agent.
- [ ] Record the current demo flow end-to-end and embed the video/GIF here.
- [ ] Hosted mini-dashboard showing pending/auto-funded/rejected advances,
      underwriting evidence and LLM explanations for guardians.
- [ ] Multi-source-chain support (today: one sourceChainKey per deployment).
- [ ] Supplier/buyer self-registration with staking or a lightweight KYC gate,
      reducing reliance on owner-asserted invoice legitimacy.

## Repository provenance

This is original work written for BUIDL CTC 2026 Fall. `contracts/lib/VerifierInterface.sol`
adapts a small Apache-2.0 interface definition from Creditcoin's own
reference examples — see `contracts/lib/NOTICE.md` for attribution.
Everything else, including all business logic, the guardrail policy design,
and the off-chain agent, was written from scratch for this submission.

## Security

Threat model, trust boundaries, and known limitations are documented in
SECURITY.md. The current design deliberately keeps invoice registration as an
explicit admin trust boundary while making delivery verification, funding
policy enforcement, and repayment verification independently auditable.

The documented live deployment above is the v2 deployment. Do not infer from
it that the newer proof-gated repayment or buyer-history code is already
installed at that address; a fresh deployment is required before making that
claim.

The project also documents a historical testnet key-hygiene incident: the
original deployer key was exposed during development and owner/guardian keys
were rotated to fresh keys. Details of the leak vector, any pre-rotation use,
and repository-history cleanup are not asserted here unless independently
verified. The old key must not be reused.

## License

MIT — see LICENSE. Third-party attribution in contracts/lib/NOTICE.md.
