import type { AdvanceRequest, SupplierHistory, PolicyDecision } from "./types.js";

/**
 * Produces a human-readable explanation of a policy decision for the
 * guardian dashboard / demo UI. This is intentionally the ONLY place an LLM
 * touches this system. It never decides AUTO_APPROVE / WARN / BLOCK — that
 * is `evaluateAdvancePolicy` (deterministic) and, ultimately,
 * AttestGuardManager.sol (on-chain, unbypassable). If this call fails, times
 * out, or is disabled, the pipeline proceeds exactly as if it had never been
 * called — a fallback template note is used instead. Losing the LLM never
 * blocks or changes a funding decision; it only makes the audit trail less
 * readable to a human.
 *
 * This split exists on purpose: an earlier project in this portfolio leaned
 * on LLM/statistical judgment for the funding decision itself, which is not
 * something a judge (or a real counterparty) should have to trust blindly.
 * Here the LLM is strictly a writer, never a gatekeeper.
 */
export async function explainDecision(
  request: AdvanceRequest,
  history: SupplierHistory,
  decision: PolicyDecision,
  opts: { anthropicApiKey?: string; model?: string } = {}
): Promise<string> {
  const apiKey = opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return fallbackNote(request, history, decision);
  }

  try {
    const prompt = buildPrompt(request, history, decision);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model ?? "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return fallbackNote(request, history, decision);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text;
    return text?.trim() || fallbackNote(request, history, decision);
  } catch {
    // Network error, timeout, malformed response, whatever — the funding
    // decision was already made before this function was ever called.
    return fallbackNote(request, history, decision);
  }
}

function buildPrompt(request: AdvanceRequest, history: SupplierHistory, decision: PolicyDecision): string {
  return [
    "You are writing a one-paragraph, plain-language note for a human reviewer",
    "on a trade-finance dashboard. A deterministic policy engine has ALREADY made",
    "the funding decision below — do not second-guess it, do not suggest a",
    "different verdict, just explain it clearly in under 60 words.",
    "",
    `Verdict: ${decision.verdict}`,
    `Policy reason: ${decision.reason}`,
    `Requested advance: ${request.requestedAdvanceAmount} against invoice ${request.invoiceAmount}`,
    `Supplier auto-approve cap: ${history.autoApproveCap}, funded today: ${history.fundedToday}`,
    `Prior advances with this buyer: ${history.priorAdvancesWithThisBuyer}, prior defaults: ${history.priorDefaultsWithThisBuyer}`,
  ].join("\n");
}

function fallbackNote(request: AdvanceRequest, history: SupplierHistory, decision: PolicyDecision): string {
  return `[template note — LLM explanation unavailable] Verdict ${decision.verdict} for invoice ${request.invoiceId}: ${decision.reason}. Requested ${request.requestedAdvanceAmount} of ${request.invoiceAmount}.`;
}
