# Contributing

This started as a hackathon submission, so keep contributions in that spirit
for now: small, verifiable, and honest about what's tested versus what
isn't.

- Contracts: `node scripts/compile-check.cjs` must pass (standalone solc-js
  check). If you have normal network access, `npx hardhat compile` and
  `npx hardhat test` should too — please run both before opening a PR.
- Off-chain agent: `npx tsc -p offchain-agent/tsconfig.json` must produce no
  errors, and `node --test offchain-agent/dist/offchain-agent/test/*.test.js`
  must pass.
- If you add a policy rule (on-chain or in `offchain-agent/src/policy.ts`),
  add a test for it in the matching test file — the off-chain and on-chain
  rules are meant to mirror each other; note in your PR description if a
  change makes them diverge and why.
- Don't let an LLM call anywhere near the funding decision. `explain.ts` is
  advisory-only by design; keep it that way.
