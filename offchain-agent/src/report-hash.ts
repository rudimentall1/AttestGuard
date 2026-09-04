import crypto from "node:crypto";

export function hashReport(report: unknown): string {
  const serialized = JSON.stringify(
    report,
    Object.keys(report as object).sort()
  );

  return "0x" + crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");
}
