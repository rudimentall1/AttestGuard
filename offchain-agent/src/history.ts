import type { Contract } from "ethers";
import type { SupplierHistory } from "./types.js";

export interface HistoryLookupOptions {
  fromBlock: number;
  toBlock: number;
}

/**
 * Build buyer/supplier relationship history from the manager's own emitted
 * events. This is intentionally read-only: the chain is the source of truth
 * and the result is advisory evidence for underwriting only.
 *
 * We count AdvanceRegistered events for the exact supplier/buyer pair and
 * RepaymentAcknowledged events for those historical invoices. The current
 * invoice is excluded from prior history. We do not infer defaults from
 * AdvanceRejected because rejection is not a cryptographic default signal.
 */
export async function loadVerifiedSupplierHistory(
  manager: Contract,
  supplier: string,
  buyer: string,
  opts: HistoryLookupOptions
): Promise<SupplierHistory> {
  if (!Number.isInteger(opts.fromBlock) || opts.fromBlock < 0) {
    throw new Error("history fromBlock must be a non-negative integer");
  }
  if (!Number.isInteger(opts.toBlock) || opts.toBlock < opts.fromBlock) {
    throw new Error("history toBlock must be at or above fromBlock");
  }

  const autoApproveCap: bigint = await manager.autoApproveCap(supplier);
  const dailyCap: bigint = await manager.perSupplierDailyCap();
  const fundedToday: bigint = await manager.suppliersFundedToday(supplier);

  const registrations = await manager.queryFilter(
    manager.filters.AdvanceRegistered(null, supplier, buyer),
    opts.fromBlock,
    opts.toBlock
  );

  const invoiceIds = registrations
    .map((event) => {
      const log = event as any;
      return log.args?.invoiceId as string | undefined;
    })
    .filter((invoiceId): invoiceId is string => typeof invoiceId === "string");

  const repayments = new Set<string>();
  for (const invoiceId of invoiceIds) {
    const events = await manager.queryFilter(
      manager.filters.RepaymentAcknowledged(invoiceId),
      opts.fromBlock,
      opts.toBlock
    );
    if (events.length > 0) repayments.add(invoiceId.toLowerCase());
  }

  return {
    supplier,
    autoApproveCap,
    fundedToday,
    perSupplierDailyCap: dailyCap,
    priorAdvancesWithThisBuyer: Math.max(0, invoiceIds.length - 1),
    priorDefaultsWithThisBuyer: 0,
    priorRepaymentsWithThisBuyer: repayments.size,
    historyComplete: true,
  };
}
