import "dotenv/config";
import fs from "node:fs";
import { Contract, ethers } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

import managerAbi from "../../contracts/abi/AttestGuardManager.json" with { type: "json" };
import tradeAbi from "../../contracts/abi/TradeConfirmation.json" with { type: "json" };
import { evaluateAdvancePolicy } from "./policy.js";
import { explainDecision } from "./explain.js";
import { routeReview, shouldHoldForReview } from "./routing.js";
import { underwrite } from "./underwriter.js";
import { hashUnderwritingDecision } from "./decision.js";
import { hashAuditTrace } from "./audit-hash.js";
import { loadVerifiedSupplierHistory } from "./history.js";
import { ensureUnderwritingDecisionRecorded } from "./underwriting-recording.js";
import { appendUnderwritingAuditEvent } from "./audit-trail.js";
import { writeUnderwritingReport } from "./report.js";
import { verifyReportIntegrity } from "./report-verify.js";
import { applyAIBoundary } from "./ai-boundary.js";
import { hashReport } from "./report-hash.js";
import { createProofBundle } from "./proof/proof-bundle.js";
import { writeProofBundleArtifact } from "./proof/artifact.js";
import { verifyProofBundle } from "./proof/verify.js";
import type { AdvanceRequest, UnderwritingEvidence } from "./types.js";

const underwritingDecisionAbi = [
  "function recordUnderwritingDecision(bytes32 invoiceId, bytes32 decisionHash) external",
  "function underwritingDecisionHash(bytes32 invoiceId) view returns (bytes32)",
];

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
  proofMaxAttempts: number;
  proofRetryBaseMs: number;
  proofRetryMaxMs: number;
  eventRetryBaseMs: number;
  eventRetryMaxMs: number;
  reviewQueuePath: string;
  auditTrailPath: string;
  reportPath: string;
}

export interface DeliveryEvent {
  invoiceId: string;
  buyer: string;
  supplier: string;
  amount: bigint;
  txHash: string;
}

export interface PendingDelivery {
  event: DeliveryEvent;
  attempts: number;
  nextRetryAt: number;
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
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
    pollIntervalMs: envPositiveInt("POLL_INTERVAL_MS", 15000),
    historyFromBlock: Number(process.env.HISTORY_FROM_BLOCK ?? "0"),
    proofMaxAttempts: envPositiveInt("PROOF_MAX_ATTEMPTS", 6),
    proofRetryBaseMs: envPositiveInt("PROOF_RETRY_BASE_MS", 2000),
    proofRetryMaxMs: envPositiveInt("PROOF_RETRY_MAX_MS", 30000),
    eventRetryBaseMs: envPositiveInt("EVENT_RETRY_BASE_MS", 15000),
    eventRetryMaxMs: envPositiveInt("EVENT_RETRY_MAX_MS", 120000),
    reviewQueuePath: process.env.AI_REVIEW_QUEUE_PATH ?? "./ai-review-queue.jsonl",
    auditTrailPath: process.env.AI_AUDIT_TRAIL_PATH ?? "./audit/underwriting-events.jsonl",
    reportPath: process.env.AI_REPORT_PATH ?? "./audit/underwriting-report.json",
  };
}

export function appendToReviewQueue(
  path: string,
  entry: { invoiceId: string; reason: string; decisionHash: string; queuedAt: string }
): boolean {
  if (fs.existsSync(path)) {
    const existing = fs.readFileSync(path, "utf8");

    for (const line of existing.split(/\r?\n/)) {
      if (!line.trim()) continue;

      try {
        const queued = JSON.parse(line) as {
          invoiceId?: unknown;
          decisionHash?: unknown;
        };

        if (
          queued.invoiceId === entry.invoiceId &&
          queued.decisionHash === entry.decisionHash
        ) {
          console.log(
            `[worker] AI review already queued for ${entry.invoiceId}; reusing existing queue entry`
          );
          return false;
        }
      } catch {
        // Ignore malformed historical lines.
      }
    }
  }

  const directory = path.replace(/[\\/][^\\/]+$/, "");

  if (directory && !fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");

  return true;
}

export function exponentialBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("attempt must be a non-negative integer");
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

async function getProofWithRetry(
  proofBuilder: proofProvider.service.ProofBuilder,
  txHash: string,
  maxAttempts: number,
  baseMs: number,
  maxMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const proofResult = await proofBuilder.getProof(txHash);
    if (proofResult.success && proofResult.data) return proofResult.data;

    if (attempt + 1 >= maxAttempts) {
      throw new Error(`proof generation failed after ${maxAttempts} attempts: ${proofResult.error ?? "unknown reason"}`);
    }

    const delayMs = exponentialBackoffMs(attempt, baseMs, maxMs);
    console.warn(
      `[worker] proof not ready for tx ${txHash} (${proofResult.error ?? "unknown reason"}), retrying in ${delayMs}ms (${attempt + 2}/${maxAttempts})...`
    );
    await sleep(delayMs);
  }

  throw new Error(`proof generation failed after ${maxAttempts} attempts`);
}

async function handleDeliveryConfirmed(
  cfg: WorkerConfig,
  manager: Contract,
  creditcoinWallet: ethers.Wallet,
  event: DeliveryEvent
) {
  console.log(`[worker] DeliveryConfirmed for invoice ${event.invoiceId} (tx ${event.txHash})`);

  const onChainAdvance = await manager.getAdvance(event.invoiceId);
  if (Number(onChainAdvance.status) !== 1 /* Registered */) {
    console.log(`[worker] invoice ${event.invoiceId} is not in Registered state on-chain, skipping`);
    return;
  }

  if (event.buyer.toLowerCase() !== onChainAdvance.buyer.toLowerCase()) {
    console.warn(`[worker] buyer mismatch for ${event.invoiceId}; skipping advisory processing`);
    return;
  }
  if (event.supplier.toLowerCase() !== onChainAdvance.supplier.toLowerCase()) {
    console.warn(`[worker] supplier mismatch for ${event.invoiceId}; skipping advisory processing`);
    return;
  }

  const request: AdvanceRequest = {
    invoiceId: event.invoiceId,
    supplier: onChainAdvance.supplier,
    buyer: onChainAdvance.buyer,
    invoiceAmount: onChainAdvance.invoiceAmount,
    requestedAdvanceAmount: onChainAdvance.requestedAdvanceAmount,
  };

  const history = await loadVerifiedSupplierHistory(
    manager,
    request.supplier,
    request.buyer,
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
  console.log(`[worker] policy pre-check: ${decision.verdict} вЂ” ${decision.reason}`);
  console.log(`[worker] risk note: ${note}`);

  if (decision.verdict === "BLOCK") {
    console.log(`[worker] pre-check says BLOCK; not spending gas on a proof submission that would fail on-chain too.`);
    return;
  }

  const proofBuilder = new proofProvider.service.ProofBuilder(cfg.sourceChainKey, cfg.proofBuilderUrl);
  const { headerNumber, txBytes, merkleProof, continuityProof } = await getProofWithRetry(
    proofBuilder,
    event.txHash,
    cfg.proofMaxAttempts,
    cfg.proofRetryBaseMs,
    cfg.proofRetryMaxMs
  );

  const underwritingEvidence: UnderwritingEvidence = {
    request,
    history,
    deliveryVerified: true,
    proofVerified: true,
    invoiceAgeSeconds: 0,
  };
  const underwriting = await underwrite(underwritingEvidence);
  const decisionHash = hashUnderwritingDecision(underwriting);

  console.log(
    `[worker] bounded underwriting: tier=${underwriting.riskTier} recommendation=${underwriting.recommendedAdvance} confidence=${underwriting.confidenceBps}bps evidence=${underwriting.evidenceHash} decision=${decisionHash}`
  );

  const routing = routeReview(request, decision, underwriting);

  const aiRecommendation =
    underwriting.riskTier === "D"
      ? "REVIEW"
      : "AUTO_PATH";

  const boundedAI = applyAIBoundary(
    routing.route === "ONCHAIN_GUARDIAN_REVIEW" ||
    routing.route === "AI_REVIEW_RECOMMENDED"
      ? "REVIEW"
      : routing.route,
    aiRecommendation
  );


  const aiTraceHash = hashAuditTrace({
    decisionHash,
    aiApplied: boundedAI.aiApplied,
    aiReason: boundedAI.reason,
    aiFinalRoute: boundedAI.route,
    routingRoute: routing.route,
    reasonCodes: [routing.reason],
  });

  console.log(`[worker] review route: ${routing.route} вЂ” ${routing.reason}`);

  appendUnderwritingAuditEvent(cfg.auditTrailPath, {
    invoiceId: event.invoiceId,
    decisionHash,
    aiTraceHash,
    policyDecision: decision.verdict === "AUTO_APPROVE" ? "AUTO" : decision.verdict,
    timestamp: new Date().toISOString(),
recommendation:
      routing.route === "AUTO_PATH"
        ? "APPROVE"
        : routing.route === "BLOCKED_BY_POLICY"
          ? "BLOCK"
          : "REVIEW",
    confidence: underwriting.confidenceBps / 10000,
    explanation: note,
    deterministicReason: decision.reason,
    finalOutcome:
      routing.route === "AUTO_PATH"
        ? "APPROVE"
        : routing.route === "BLOCKED_BY_POLICY"
          ? "BLOCK"
          : "REVIEW",
    requiresHumanReview: shouldHoldForReview(routing.route),
    evidenceHash: underwriting.evidenceHash,
    riskFlags: underwriting.riskFlags,
    routingRoute: routing.route,
    aiApplied: boundedAI.aiApplied,
    aiReason: boundedAI.reason,
    aiFinalRoute: boundedAI.route,
    reasonCodes: [routing.reason],
    
  });
  const report = {
    reportVersion: "1.0" as const,
    decisionId: decisionHash,

    integrity: {
      decisionHash,
      evidenceHash: underwriting.evidenceHash,
      aiTraceHash,
    },

    summary: {
      outcome:
        (routing.route === "AUTO_PATH"
          ? "APPROVE"
          : routing.route === "BLOCKED_BY_POLICY"
            ? "BLOCK"
            : "REVIEW") as "APPROVE" | "BLOCK" | "REVIEW",
      riskTier: underwriting.riskTier,
    timestamp: new Date().toISOString(),
confidence: underwriting.confidenceBps / 10000,
    },

    policy: {
      verdict: decision.verdict,
      reason: decision.reason,
    },

    ai: {
      explanation: note,
      recommendation: routing.route,
      traceHash: aiTraceHash,
    },

    evidence: {
      hash: underwriting.evidenceHash,
      flags: underwriting.riskFlags,
    },

    review: {
      required: shouldHoldForReview(routing.route),
    },

    timestamp: new Date().toISOString(),
  };

  const reportHash = hashReport(report);

  const finalReport = {
    ...report,
    reportHash,
  };

  if (!verifyReportIntegrity(finalReport)) {
    throw new Error("underwriting report integrity verification failed");
  }

  const proofBundle = createProofBundle({
    invoiceId: event.invoiceId,
    decisionHash,
    evidenceHash: underwriting.evidenceHash,
    aiTraceHash,
    reportHash,
    policyDecision: decision.verdict,
    policyReason: decision.reason,
    aiRecommendation: boundedAI.route,
    riskTier: underwriting.riskTier,
    timestamp: new Date().toISOString(),
});

  if (!verifyProofBundle(proofBundle)) {
    throw new Error("proof bundle verification failed");
  }

  writeProofBundleArtifact(
    "./artifacts/attestguard-proof-bundle.json",
    proofBundle
  );
  writeUnderwritingReport(cfg.reportPath, finalReport);

  const decisionRecorder = new Contract(
    cfg.managerAddress,
    underwritingDecisionAbi,
    creditcoinWallet
  );

  await ensureUnderwritingDecisionRecorded(
    decisionRecorder,
    event.invoiceId,
    decisionHash
  );
  if (shouldHoldForReview(routing.route)) {
    appendToReviewQueue(cfg.reviewQueuePath, {
      invoiceId: event.invoiceId,
      reason: routing.reason,
      decisionHash,
      queuedAt: new Date().toISOString(),
    });
    console.log(`[worker] AI review recommended for invoice ${event.invoiceId} вЂ” funding held.`);
    return;
  }
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

  const infoProvider = new chainInfo.PrecompileChainInfoProvider(
    creditcoinProvider as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0]
  );
  const supported = await infoProvider.getSupportedChains();
  console.log("[worker] supported source chains on this Creditcoin deployment:", supported);

  console.log("[worker] AttestGuard agent started. Watching for DeliveryConfirmed events...");

  let fromBlock = await sourceProvider.getBlockNumber();
  const pending = new Map<string, PendingDelivery>();

  const enqueue = (event: DeliveryEvent) => {
    if (!pending.has(event.invoiceId)) {
      pending.set(event.invoiceId, { event, attempts: 0, nextRetryAt: Date.now() });
      console.log(`[worker] queued invoice ${event.invoiceId} for processing`);
    }
  };

  const processPending = async () => {
    for (const [invoiceId, item] of pending) {
      if (Date.now() < item.nextRetryAt) continue;

      try {
        await handleDeliveryConfirmed(cfg, manager, creditcoinWallet, item.event);
        pending.delete(invoiceId);
        if (item.attempts > 0) {
          console.log(`[worker] RECOVERED invoice ${invoiceId} after ${item.attempts} retry cycle(s)`);
        }
      } catch (err) {
        item.attempts += 1;
        const delayMs = exponentialBackoffMs(item.attempts - 1, cfg.eventRetryBaseMs, cfg.eventRetryMaxMs);
        item.nextRetryAt = Date.now() + delayMs;
        console.error(
          `[worker] FAILED invoice ${invoiceId}; keeping it queued for recovery in ${delayMs}ms (retry cycle ${item.attempts}):`,
          err
        );
      }
    }
  };

  const poll = async () => {
    const toBlock = await sourceProvider.getBlockNumber();
    if (toBlock >= fromBlock) {
      const events = await tradeContract.queryFilter(
        tradeContract.filters.DeliveryConfirmed(),
        fromBlock,
        toBlock
      );

      for (const ev of events) {
        const anyEv = ev as ethers.EventLog;
        const [invoiceId, buyer, supplier, amount] = anyEv.args as unknown as [string, string, string, bigint];
        enqueue({ invoiceId, buyer, supplier, amount, txHash: ev.transactionHash });
      }

      fromBlock = toBlock + 1;
    }

    await processPending();
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await poll().catch((err) => console.error("[worker] poll error:", err));
    await new Promise((resolve) => setTimeout(resolve, cfg.pollIntervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[worker] fatal error:", err);
    process.exit(1);
  });
}











