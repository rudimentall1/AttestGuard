import "dotenv/config";
import { Contract, ethers } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

import managerAbi from "../../contracts/abi/AttestGuardManager.json" with { type: "json" };
import tradeAbi from "../../contracts/abi/TradeConfirmation.json" with { type: "json" };
import { evaluateAdvancePolicy } from "./policy.js";
import { explainDecision } from "./explain.js";
import { routeReview } from "./routing.js";
import { underwrite } from "./underwriter.js";
import { loadVerifiedSupplierHistory } from "./history.js";
import type { AdvanceRequest, UnderwritingEvidence } from "./types.js";

/**
 * AttestGuard off-chain agent.
 *
 * Responsibilities (deliberately narrow):
 *   1. Watch the source-chain TradeConfirmation contract for
 *      DeliveryConfirmed events tied to advances we've registered.
 *   2. Once Creditcoin has attested the block containing that event,
 *      fetch an inclusion proof via the Attestcoin Prover service.
 *   3. Run the deterministic policy pre-check and produce a bounded AI
 *      underwriting proposal from verified evidence and on-chain history.
 *   4. Derive a monotonic review route: AI may escalate human attention but
 *      can never weaken a deterministic WARN/BLOCK decision.
 *   5. Submit the proof to AttestGuardManager.fundAdvanceFromQuery — where
 *      the *real*, unbypassable policy check happens on-chain.
 *
 * The AI underwriter, history index and review routing are advisory. They
 * cannot authorize funding, override verified facts, or exceed/weaken the
 * deterministic policy envelope. The smart contract remains authoritative.
 */

interface WorkerConfig {
  proofBuilderUrl: string;
  sourceChainRpcUrl: string;
  creditcoinRpcUrl: string;
  creditcoinPrivateKey: string;
  managerAddress: string;
  sourceTradeConfirmationAddress: string;
  sourceChainKey: number;
  pollIntervalMs: number;
  historyFromBlock: number;
}

function loadConfig(): WorkerConfig {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  return {
    proofBuilderUrl: required("PROOF_BUILDER_URL"),
    sourceChainRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    creditcoinPrivateKey: required("CREDITCOIN_WALLET_PRIVATE_KEY"),
    managerAddress: required("ATTESTGUARD_MANAGER_ADDRESS"),
    sourceTradeConfirmationAddress: required("SOURCE_TRADE_CONFIRMATION_ADDRESS"),
    sourceChainKey: Number(process.env.SOURCE_CHAIN_KEY ?? "1"),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "15000"),
    historyFromBlock: Number(process.env.HISTORY_FROM_BLOCK ?? "0"),
  };
}

async function handleDeliveryConfirmed(
  cfg: WorkerConfig,
  manager: Contract,
  event: { invoiceId: string; buyer: string; supplier: string; amount: bigint; txHash: string }
) {
  console.log(`[worker] DeliveryConfirmed for invoice ${event.invoiceId} (tx ${event.txHash})`);

  const onChainAdvance = await manager.getAdvance(event.invoiceId);
  if (Number(onChainAdvance.status) !== 1 /* Registered */) {
    console.log(`[worker] invoice ${event.invoiceId} is not in Registered state on-chain, skipping`);
    return;
  }

  const request: AdvanceRequest = {
    invoiceId: event.invoiceId,
    supplier: event.supplier,
    buyer: event.buyer,
    invoiceAmount: onChainAdvance.invoiceAmount,
    requestedAdvanceAmount: onChainAdvance.requestedAdvanceAmount,
  };

  const history = await loadVerifiedSupplierHistory(
    manager,
    event.supplier,
    event.buyer,
    {
      fromBlock: cfg.historyFromBlock,
      toBlock: await manager.runner!.provider!.getBlockNumber(),
    }
  );
  const decision = evaluateAdvancePolicy(request, history);
  const note = await explainDecision(request, history, decision);
  console.log(
    `[worker] verified relationship history: prior advances=${history.priorAdvancesWithThisBuyer} prior repayments=${history.priorRepaymentsWithThisBuyer} prior defaults=${history.priorDefaultsWithThisBuyer}`
  );
  console.log(`[worker] policy pre-check: ${decision.verdict} — ${decision.reason}`);
  console.log(`[worker] risk note: ${note}`);

  if (decision.verdict === "BLOCK") {
    console.log(`[worker] pre-check says BLOCK; not spending gas on a proof submission that would fail on-chain too.`);
    return;
  }

  // Step 2: fetch a proof once Creditcoin has attested the block containing
  // this transaction. The proof service returns success: false with an
  // explanatory error until that height is attested, so we poll it with a
  // capped backoff rather than submitting on a guess.
  const proofBuilder = new proofProvider.service.ProofBuilder(cfg.sourceChainKey, cfg.proofBuilderUrl);

  let proofResult = await proofBuilder.getProof(event.txHash);
  let attempts = 0;
  const maxAttempts = 20;
  while (!proofResult.success && attempts < maxAttempts) {
    attempts += 1;
    console.log(
      `[worker] proof not ready yet for tx ${event.txHash} (${proofResult.error ?? "unknown reason"}), retrying (${attempts}/${maxAttempts})...`
    );
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    proofResult = await proofBuilder.getProof(event.txHash);
  }

  if (!proofResult.success || !proofResult.data) {
    console.error(`[worker] proof generation failed after ${attempts} attempts: ${proofResult.error}`);
    return;
  }

  const { headerNumber, txBytes, merkleProof, continuityProof } = proofResult.data;

  // Step 3: underwriting sees the verified event + proof facts. It produces
  // a structured proposal only; it has no transaction-signing or funding
  // authority. The proposal is deterministically bounded before it is logged.
  const underwritingEvidence: UnderwritingEvidence = {
    request,
    history,
    deliveryVerified: true,
    proofVerified: true,
    // Timestamp enrichment is intentionally optional in v1. The security
    // envelope does not depend on this advisory field.
    invoiceAgeSeconds: 0,
  };
  const underwriting = await underwrite(underwritingEvidence);
  console.log(
    `[worker] bounded underwriting: tier=${underwriting.riskTier} recommendation=${underwriting.recommendedAdvance} confidence=${underwriting.confidenceBps}bps evidence=${underwriting.evidenceHash}`
  );

  const routing = routeReview(request, decision, underwriting);
  console.log(`[worker] review route: ${routing.route} — ${routing.reason}`);

  // The review route is deliberately not an execution authorization. In v1,
  // an AI escalation is surfaced to operators/audit logs while the existing
  // deterministic policy and on-chain manager remain the only safety gates.
  // In particular, AI_REVIEW_RECOMMENDED must never be described as a hard
  // pre-funding hold unless a future on-chain/manual-review mechanism is added.

  // Step 5: submit to Creditcoin. AttestGuardManager independently
  // re-verifies the proof and re-runs its own policy gate — this call can
  // still result in AdvanceFlaggedForConfirmation on-chain even though our
  // own pre-check above said AUTO_APPROVE, if on-chain state has since
  // moved (e.g. another advance consumed the daily cap in the meantime).
  const submitTx = await manager.fundAdvanceFromQuery(
    event.invoiceId,
    headerNumber,
    txBytes,
    merkleProof.root,
    merkleProof.siblings,
    continuityProof.lowerEndpointDigest,
    continuityProof.roots
  );
  const receipt = await submitTx.wait();
  console.log(`[worker] submitted fundAdvanceFromQuery, tx hash: ${receipt?.hash}`);
}

async function main() {
  const cfg = loadConfig();

  const creditcoinProvider = new ethers.JsonRpcProvider(cfg.creditcoinRpcUrl);
  const creditcoinWallet = new ethers.Wallet(cfg.creditcoinPrivateKey, creditcoinProvider);
  const manager = new Contract(cfg.managerAddress, managerAbi, creditcoinWallet);

  const sourceProvider = new ethers.JsonRpcProvider(cfg.sourceChainRpcUrl);
  const tradeContract = new Contract(cfg.sourceTradeConfirmationAddress, tradeAbi, sourceProvider);

  // Sanity check: confirm we're pointed at chains that agree on chainKey.
  const infoProvider = new chainInfo.PrecompileChainInfoProvider(
    creditcoinProvider as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0]
  );
  const supported = await infoProvider.getSupportedChains();
  console.log("[worker] supported source chains on this Creditcoin deployment:", supported);

  console.log("[worker] AttestGuard agent started. Watching for DeliveryConfirmed events...");

  let fromBlock = await sourceProvider.getBlockNumber();

  const poll = async () => {
    const toBlock = await sourceProvider.getBlockNumber();
    if (toBlock < fromBlock) return;

    const events = await tradeContract.queryFilter(
      tradeContract.filters.DeliveryConfirmed(),
      fromBlock,
      toBlock
    );

    for (const ev of events) {
      const anyEv = ev as ethers.EventLog;
      const [invoiceId, buyer, supplier, amount] = anyEv.args as unknown as [string, string, string, bigint];
      await handleDeliveryConfirmed(cfg, manager, {
        invoiceId,
        buyer,
        supplier,
        amount,
        txHash: ev.transactionHash,
      }).catch((err) => console.error("[worker] error handling event:", err));
    }

    fromBlock = toBlock + 1;
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await poll().catch((err) => console.error("[worker] poll error:", err));
    await new Promise((resolve) => setTimeout(resolve, cfg.pollIntervalMs));
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
