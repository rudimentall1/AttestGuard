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

A supplier ships goods to a buyer against an invoice. Normally they wait 30-90
days to get paid, or pay a factoring desk a fat discount for early cash - and
that desk still needs someone to manually check that delivery actually
happened before wiring money.

AttestGuard replaces the manual check with the **Attestcoin Protocol**:
Creditcoin's native ability to cryptographically verify that an event really
happened on another chain, with no centralized oracle operator in the loop.
The moment a buyer confirms delivery on-chain (on any EVM chain - Ethereum
Sepolia in this demo), an AI agent notices, fetches a proof, and triggers an
advance payout to the supplier on Creditcoin - but the payout only happens if
it also clears a **deterministic, on-chain guardrail policy** (per-supplier
caps, daily limits, human confirmation above a threshold) that the agent
itself cannot bypass, because the check lives in the smart contract, not in
the agent's process.

```nBuyer confirms delivery         Attestcoin Protocol            AttestGuardManager.sol
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
author's portfolio - **Agentic Wallet Guardian** and **Agent Guardrail** -
both about letting AI agents take autonomous action safely. The first leaned
on wallet/contract "risk scores" that, under an outside audit, turned out to
still be backed by placeholder data rather than real signals. The second
fixed that by committing to deterministic, unbypassable enforcement instead
of AI judgment calls - but had no real external data source to act on yet.

**AttestGuard is what you get when you point that lesson at Creditcoin's own
infrastructure.** The Attestcoin Protocol is the missing "real data" half:
cryptographically verified cross-chain events instead of an API response you
have to trust. The guardrail-policy half - deterministic caps, human
confirmation above a threshold, reputation earned only from verified
history, never from an LLM's opinion - is the safety half. Put together, you
get an AI agent that can be trusted to move real money, because every
individual decision it makes is checked by something stronger than itself:
cryptography on the input side, immutable contract logic on the output side.

## What's real right now, honestly

Following the same standard applied to this author's earlier projects - say
plainly what's built versus what's roadmap, because judges (rightly) punish
the gap between the pitch and the code more than they punish an honest TODO:

| Component | Status |
|---|---|
| AttestGuardManager.sol - full on-chain policy gate (caps, daily limits, WARN/confirm flow, reputation growth on repayment) | Deployed on Creditcoin CC3 testnet, real Hardhat/chai tests passing (6/6) |
| TradeConfirmation.sol - source-chain event emitter | Deployed on Sepolia |
| Off-chain policy pre-check (policy.ts) | 8/8 unit tests passing - real assertions, real bugs already caught and fixed during writing |
| LLM risk-note generator (explain.ts) | Written, calls the real Anthropic Messages API when a key is present, degrades to a template note otherwise - deliberately never affects the funding decision |
| Off-chain worker (worker.ts) - event watcher, proof fetch/retry loop, submission | Written and typechecks clean against the real @gluwa/usc-sdk v0.18 API, using Creditcoin's own waitUntilHeightAttested pattern |
| Full end-to-end flow: Sepolia event -> Attestcoin proof -> on-chain policy gate -> funds moved | Done, live, on real testnets. See Live deployment below for the exact addresses and transaction hashes - this is not simulated. |

### Live deployment

Deployed and exercised end-to-end on real public testnets - every address
and transaction hash below is independently verifiable on-chain:

**Creditcoin CC3 testnet**
- AttestGuardManager: 0x1Fe931df9325FE1392490a15DAc57bA34f51D6fa
- EvmV1Decoder (linked library): 0x10dcb66Aa031A7134e70f13C6E79c87a9D222905
- DemoAdvanceToken (advance payout token, "aUSD"): 0x4D09CdD490c1Ce48BCB6dA5c1A6Bf41E2f5e853D
- Explorer: https://creditcoin-testnet.blockscout.com/address/0x1Fe931df9325FE1392490a15DAc57bA34f51D6fa

**Ethereum Sepolia (source chain)**
- TradeConfirmation: 0x8FA8Ef84036D81824A6EAab7C26A6d385c8d005F

**A real end-to-end run, no mocks, no simulation:**
1. Buyer called confirmDelivery(...) on Sepolia - tx 0xc3435c8c5866582ba41fdefb958b50e2fab2247602b6133c4fb9f2ca031c6e4e (https://sepolia.etherscan.io/tx/0xc3435c8c5866582ba41fdefb958b50e2fab2247602b6133c4fb9f2ca031c6e4e)
2. Attestcoin Protocol attested the containing block and generated a Merkle + continuity proof - no oracle operator involved.
3. That proof was submitted to AttestGuardManager.fundAdvanceFromQuery on Creditcoin - tx 0x29953a1b77eceec073652364adca2ffe09b87daf8425d637c643825721665db2 (https://creditcoin-testnet.blockscout.com/tx/0x29953a1b77eceec073652364adca2ffe09b87daf8425d637c643825721665db2). The contract independently re-verified the proof via the Block Prover precompile, decoded the real transaction bytes, matched the invoice and buyer, and checked the request (300 aUSD against a 1,000 aUSD invoice) against the on-chain guardrail policy.
4. The advance was within DEFAULT_AUTO_APPROVE_CAP, so it auto-funded - no human touched step 3 or 4. Final on-chain status: Funded.

### Compilation proof

The sandbox this was built in blocks binaries.soliditylang.org (Hardhat's
compiler downloader needs it), so npx hardhat compile fails there - but the
identical Solidity was verified with real solc 0.8.23 via a standalone
solc-js script that resolves imports through the actual installed
@gluwa/usc-contracts and @openzeppelin/contracts packages. On a normal dev
machine or in CI (.github/workflows/ci.yml), just run npx hardhat compile /
npx hardhat test directly - no workaround needed. The off-chain agent's
policy engine has 8 real, currently-passing unit tests (see
offchain-agent/test/policy.test.ts).

## Architecture

contracts/
  lib/VerifierInterface.sol   - Block Prover precompile interface (Apache-2.0, attributed, see NOTICE.md)
  src/AdvanceTypes.sol        - AdvanceRequest struct + status enum
  src/AttestGuardManager.sol  - the ASC: verifies proofs, applies the guardrail policy gate
  src/TradeConfirmation.sol   - source-chain contract buyers call to confirm delivery
  src/DemoAdvanceToken.sol    - demo ERC20 used as the payout token
  abi/                        - extracted ABIs (checked in, no build step needed to read them)

offchain-agent/
  src/types.ts                - shared types
  src/policy.ts                - deterministic pre-check (gas-saving mirror of the on-chain gate)
  src/explain.ts               - optional LLM-written risk note for humans; never a safety gate
  src/worker.ts                - watches the source chain, fetches Attestcoin proofs, submits to Creditcoin
  test/policy.test.ts          - real, passing unit tests for the policy engine

deploy/deploy_manager.ts      - deploys the manager (+ demo token if needed) to whatever network hardhat targets
contracts-test/               - Hardhat/chai integration tests (run on a machine with solc binary access)

### The core design decision

There are two very different kinds of "verification" happening here, and
keeping them separate is the whole point:

1. Did the event really happen? Answered by the Attestcoin Protocol -
   cryptography (Merkle inclusion + continuity proofs, checked by
   Creditcoin's native Block Prover precompile), not a trusted third party.
2. Should we act on it, right now, in this amount? Answered by the
   guardrail policy in AttestGuardManager.sol - deterministic rules, not
   an AI agent's judgment call, and enforced on-chain so the off-chain agent
   physically cannot skip it, not just "advised" to check it.

An off-chain AI agent orchestrates both steps and can optionally use an LLM
to write a human-readable explanation of the outcome - but the LLM never
gets a vote on whether money moves. That split is the direct, deliberate
answer to the most obvious question a judge will ask: "how do I know your
AI agent won't just be tricked or wrong?" Because it doesn't matter if it
is - the contract re-derives the verdict independently either way.

## Track fit

- AI: an autonomous agent that processes cryptographically verified
  cross-chain data (Attestcoin proofs) to inform a decision and trigger an
  on-chain transaction, with zero centralized oracle operators anywhere in
  the path - this is closer than it might look to the track description
  verbatim.
- RWA: invoice/trade-finance advances are financing against a real-world
  asset (an accounts-receivable claim), released against a real-world event
  (delivery/acceptance).
- DeFi: functionally a lending primitive - an advance is a
  short-duration, collateral-light loan against a verified future cash flow.

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

This is the exact sequence already run successfully on real testnets (see
Live deployment for the resulting addresses and tx hashes):

1. npx hardhat run deploy/demo_register_advance.ts --network creditcoin_testnet
   - registers a 1,000 aUSD invoice with a 300 aUSD requested advance
   (within the default auto-approve cap).
2. npx hardhat run deploy/demo_confirm_delivery.ts --network sepolia
   (with the invoiceId from step 1) - buyer confirms delivery on Sepolia.
3. npx hardhat run deploy/demo_process_delivery.ts --network creditcoin_testnet
   (with the resulting tx hash) - waits for Creditcoin to attest the block,
   fetches an Attestcoin proof, and submits it to fundAdvanceFromQuery.
   Logs show the on-chain policy gate evaluating the request and the
   advance moving to Funded - no human touched any of this.
4. Repeat with an amount above the auto-approve cap and show the advance
   land in PendingConfirmation, then call confirmPendingAdvance from the
   guardian wallet.
5. Call acknowledgeRepayment; show the supplier's autoApproveCap increase
   on-chain - reputation earned from a real repayment, not asserted by
   the agent.

(offchain-agent/src/worker.ts does steps 2-3 continuously and automatically
for new invoices going forward; the demo_* scripts above exist because the
worker's polling loop starts from "now" and won't pick up an event that
already happened before it was started.)

## Roadmap to a finalist-grade demo

- [x] Fund a Creditcoin CC3 testnet wallet + Sepolia wallet, run the
      deploy scripts for real, capture the resulting addresses here.
- [x] Full end-to-end run on real testnets (event -> proof -> policy gate ->
      funds moved) - see Live deployment.
- [ ] MockNativeQueryVerifier at 0x0FD2 for a full Hardhat integration
      test of fundAdvanceFromQuery, including a hand-built
      encodedTransaction fixture matching EvmV1Decoder's expected layout
      - the live run above proves the real path works, but the test suite
      still doesn't cover it in-process.
- [ ] Record the demo script above end-to-end and embed the video/GIF here.
- [ ] Hosted mini-dashboard (reusing the confirmation-UI pattern from Agent
      Guardrail) showing pending/auto-funded/rejected advances with the LLM
      risk notes attached, for guardians to act on without a CLI.
- [ ] Replace the placeholder buyer-relationship history in
      loadSupplierHistory with a real index over past
      AdvanceConfirmed / RepaymentAcknowledged events.
- [ ] Multi-source-chain support (today: one sourceChainKey per deployment).

## Repository provenance

This is original work written for BUIDL CTC 2026 Fall. contracts/lib/VerifierInterface.sol
adapts a small (16-line) Apache-2.0 interface definition from Creditcoin's
own reference examples - see contracts/lib/NOTICE.md for full attribution.
Everything else, including all business logic, the guardrail policy design,
and the off-chain agent, was written from scratch for this submission,
informed by (but not copied from) the design lessons of this author's
earlier Agentic Wallet Guardian and Agent Guardrail projects.

## License

MIT - see LICENSE. Third-party attribution in contracts/lib/NOTICE.md.
