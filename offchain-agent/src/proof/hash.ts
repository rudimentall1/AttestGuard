import crypto from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    return Object.keys(obj)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = canonicalize(obj[key]);
          return acc;
        },
        {} as Record<string, unknown>
      );
  }

  return value;
}

export function hashProofBundle(
  value: unknown
): string {
  const canonical = canonicalize(value);

  const serialized = JSON.stringify(canonical);

  return crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");
}
