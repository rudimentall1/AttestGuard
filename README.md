# AttestGuard

**AI-agent-gated trade-finance advances on Creditcoin — funded the instant a
cross-chain event is *cryptographically verified*, never on an oracle's word
and never on an AI agent's unchecked say-so.**

Built for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
— primary track **AI**, with direct crossover into **RWA** and **DeFi**
(invoice/trade-finance advances are real-world-asset financing by
definition).

---

## The 30-second pitch

A supplier ships goods to a buyer against an invoice. Normally they wait 30–90
days to get paid, or pay a factoring desk a fat discount for early cash — and
that desk still needs someone to manually check that delivery actually
happened before wiring money.

AttestGuard replaces the manual check with the **Attestcoin Protocol**:
Creditcoin's native ability to cryptographically verify that an event really
happened on another chain, with no centralized oracle operator in the loop.
The moment a buyer confirms delivery on-chain (on any EVM chain — Ethereum
Sepolia in this demo), an AI agent notices, fetches a proof, and triggers an
advance payout to the supplier on Creditcoin — but the payout only happens if
it also clears a **deterministic, on-chain guardrail policy** (per-supplier
caps, daily limits, human confirmation above a threshold) that the agent
itself cannot bypass, because the check lives in the smart contract, not in
the agent's process.

```
Buyer confirms delivery         Attestcoin Protocol            AttestGuardManager.sol
   on source chain      ---->   proves it happened      --->   (on Creditcoin)
  (TradeConfirmation.sol)       (no oracle operator)            |
                                                                 |-- within caps? --> auto-fund
                                                                 |-- over cap?    --> flag for
                                                                 |                     human guardian
                                                                 |-- repaid?      --> raise cap
                                                                        (reputation, earned only
                                                                         from verified history)
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
confirmation above a threshold, reputation earned only from verified
history, never from an LLM's opinion — is the safety half. Put together, you
get an AI agent that can be trusted to move real money, because every
individual decision it makes is checked by something stronger than itself:
cryptography on the input side, immutable contract logic on the output side.

## What's real right now, honestly

Following the same standard applied to this author's earlier projects — say
plainly what's built versus what's roadmap, because judges (rightly) punish
the gap between the pitch and the code more than they punish an honest TODO:

| Component | Status |
|---|---|
| `AttestGuardManager.sol` — full on-chain policy gate (caps, daily limits, WARN/confirm flow, reputation growth on repayment) | **Written, compiles clean** against the real `@gluwa/usc-contracts` decoder and `@openzeppelin/contracts` — see [Compilation proof](#compilation-proof) below |
| `TradeConfirmation.sol` — source-chain event emitter | **Written, compiles clean** |
| Off-chain policy pre-check (`policy.ts`) | **Written, 8/8 unit tests passing** — real assertions, real bugs already caught and fixed during writing (see test file) |
| LLM risk-note generator (`explain.ts`) | **Written**, calls the real Anthropic Messages API when a key is present, degrades to a template note otherwise — deliberately never affects the funding decision |
| Off-chain worker (`worker.ts`) — event watcher, proof fetch/retry loop, submission | **Written and typechecks clean** against the real `@gluwa/usc-sdk` v0.18 API. **Not yet run against a live testnet deployment** — see Roadmap |
| Testnet deployment (Creditcoin CC3 + Sepolia) | **Not yet deployed.** Deploy scripts are ready (`npm run deploy:manager`); this needs a funded testnet wallet, which is the next concrete step before demo day |
| Full proof-gated funding path test (mock verifier at `0x0FD2`) | **Not yet written** — flagged explicitly in `contracts-test/AttestGuardManager.test.ts` as the single highest-value next addition |

### Compilation proof

The sandbox this was built in blocks `binaries.soliditylang.org` (Hardhat's
compiler downloader needs it), so `npx hardhat compile` fails there — but the
identical Solidity was verified with real `solc 0.8.23` via a standalone
solc-js script that resolves imports through the actual installed
`@gluwa/usc-contracts` and `@openzeppelin/contracts` packages:

```
$ node scripts/compile-check.cjs

Compilation OK. Contracts:
  - contracts/src/AttestGuardManager.sol:AttestGuardManager  (9115 bytes runtime+init)
  - contracts/src/TradeConfirmation.sol:TradeConfirmation  (371 bytes runtime+init)
  - contracts/src/DemoAdvanceToken.sol:DemoAdvanceToken  (2683 bytes runtime+init)
  - @gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder  ...
  - @openzeppelin/contracts/access/Ownable.sol:Ownable  ...
  (full contract + dependency list in the actual output)
```

On a normal dev machine or in CI (`.github/workflows/ci.yml`), just run
`npx hardhat compile` / `npx hardhat test` directly — no workaround needed.

The off-chain agent's policy engine has real, currently-passing tests:

```
$ npx tsc -p offchain-agent/tsconfig.json
$ node --test offchain-agent/dist/offchain-agent/test/*.test.js
✔ auto-approves a routine advance within all caps with clean history
✔ blocks an advance that requests more than the invoice is worth
✔ blocks a zero or negative advance amount
✔ warns when amount exceeds the supplier's auto-approve cap
✔ warns when funding would breach the supplier's daily cap even under the per-advance cap
✔ warns on any buyer with a prior default, regardless of amount
✔ warns (does not silently auto-approve) the very first advance tied to a new buyer relationship
✔ a defaulted buyer takes priority over an otherwise-clean cap check
# pass 8, fail 0
```

## Architecture

```
contracts/
  lib/VerifierInterface.sol   — Block Prover precompile interface (Apache-2.0, attributed, see NOTICE.md)
  src/AdvanceTypes.sol        — AdvanceRequest struct + status enum
  src/AttestGuardManager.sol  — the ASC: verifies proofs, applies the guardrail policy gate
  src/TradeConfirmation.sol   — source-chain contract buyers call to confirm delivery
  src/DemoAdvanceToken.sol    — demo ERC20 used as the payout token
  abi/                        — extracted ABIs (checked in, no build step needed to read them)

offchain-agent/
  src/types.ts                — shared types
  src/policy.ts                — deterministic pre-check (gas-saving mirror of the on-chain gate)
  src/explain.ts               — optional LLM-written risk note for humans; never a safety gate
  src/worker.ts                — watches the source chain, fetches Attestcoin proofs, submits to Creditcoin
  test/policy.test.ts          — real, passing unit tests for the policy engine

deploy/deploy_manager.ts      — deploys the manager (+ demo token if needed) to whatever network hardhat targets
contracts-test/               — Hardhat/chai integration tests (run on a machine with solc binary access)
```

### The core design decision

There are two very different kinds of "verification" happening here, and
keeping them separate is the whole point:

1. **Did the event really happen?** Answered by the Attestcoin Protocol —
   cryptography (Merkle inclusion + continuity proofs, checked by
   Creditcoin's native Block Prover precompile), not a trusted third party.
2. **Should we act on it, right now, in this amount?** Answered by the
   guardrail policy in `AttestGuardManager.sol` — deterministic rules, not
   an AI agent's judgment call, and enforced on-chain so the off-chain agent
   physically cannot skip it, not just "advised" to check it.

An off-chain AI agent orchestrates both steps and can optionally use an LLM
to write a human-readable explanation of the outcome — but the LLM never
gets a vote on whether money moves. That split is the direct, deliberate
answer to the most obvious question a judge will ask: *"how do I know your
AI agent won't just be tricked or wrong?"* Because it doesn't matter if it
is — the contract re-derives the verdict independently either way.

## Track fit

- **AI**: an autonomous agent that processes cryptographically verified
  cross-chain data (Attestcoin proofs) to inform a decision and trigger an
  on-chain transaction, with zero centralized oracle operators anywhere in
  the path — this is closer than it might look to the track description
  verbatim.
- **RWA**: invoice/trade-finance advances are financing against a real-world
  asset (an accounts-receivable claim), released against a real-world event
  (delivery/acceptance).
- **DeFi**: functionally a lending primitive — an advance is a
  short-duration, collateral-light loan against a verified future cash flow.

## Quickstart

```bash
git clone <this-repo>
cd attestguard
npm install
cp .env.example .env   # fill in a funded Creditcoin + Sepolia testnet wallet

# Contracts (on a machine with normal network access, not this sandbox):
npx hardhat compile
npx hardhat test
npm run deploy:manager --network creditcoin_testnet

# Off-chain agent:
npm run build:agent
node --test offchain-agent/dist/offchain-agent/test/*.test.js   # policy engine tests
npm run worker   # once ATTESTGUARD_MANAGER_ADDRESS + SOURCE_TRADE_CONFIRMATION_ADDRESS are set
```

## Demo script (for the submission video)

1. Deploy `TradeConfirmation.sol` on Sepolia, `AttestGuardManager.sol` on
   Creditcoin CC3 testnet, register an invoice for a small amount (under the
   default auto-approve cap).
2. Buyer wallet calls `confirmDelivery(...)` on Sepolia.
3. Worker logs: event seen → policy pre-check `AUTO_APPROVE` → proof fetched
   from the Attestcoin prover → `fundAdvanceFromQuery` submitted to
   Creditcoin → supplier's balance increases, on-chain, within ~30 seconds
   of the Sepolia confirmation — no human touched it.
4. Repeat with an amount above the auto-approve cap: worker logs
   `WARN — requested amount exceeds this supplier's current auto-approve
   cap`; on-chain, the advance sits in `PendingConfirmation`; guardian
   wallet calls `confirmPendingAdvance`; funds move.
5. Owner calls `acknowledgeRepayment`; show the supplier's `autoApproveCap`
   increase on-chain — reputation earned from a real repayment, not
   asserted by the agent.

## Roadmap to a finalist-grade demo

- [ ] Fund a Creditcoin CC3 testnet wallet + Sepolia wallet, run the
      deploy scripts for real, capture the resulting addresses here.
- [ ] `MockNativeQueryVerifier` at `0x0FD2` for a full Hardhat integration
      test of `fundAdvanceFromQuery`, including a hand-built
      `encodedTransaction` fixture matching `EvmV1Decoder`'s expected layout.
- [ ] Record the demo script above end-to-end and embed the video/GIF here.
- [ ] Hosted mini-dashboard (reusing the confirmation-UI pattern from Agent
      Guardrail) showing pending/auto-funded/rejected advances with the LLM
      risk notes attached, for guardians to act on without a CLI.
- [ ] Replace the placeholder buyer-relationship history in
      `loadSupplierHistory` with a real index over past
      `AdvanceConfirmed` / `RepaymentAcknowledged` events.
- [ ] Multi-source-chain support (today: one `sourceChainKey` per deployment).

## Repository provenance

This is original work written for BUIDL CTC 2026 Fall. `contracts/lib/VerifierInterface.sol`
adapts a small (16-line) Apache-2.0 interface definition from Creditcoin's
own reference examples — see `contracts/lib/NOTICE.md` for full attribution.
Everything else, including all business logic, the guardrail policy design,
and the off-chain agent, was written from scratch for this submission,
informed by (but not copied from) the design lessons of this author's
earlier Agentic Wallet Guardian and Agent Guardrail projects.

## License

MIT — see [LICENSE](./LICENSE). Third-party attribution in
[contracts/lib/NOTICE.md](./contracts/lib/NOTICE.md).
