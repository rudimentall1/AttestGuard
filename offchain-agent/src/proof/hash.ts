import crypto from "node:crypto";

export function hashProofBundle(
  value: unknown
): string {
  const serialized = JSON.stringify(
    value,
    Object.keys(value as object).sort()
  );

  return crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");
}
