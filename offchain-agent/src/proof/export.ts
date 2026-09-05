import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function exportProofBundle(
  bundle: AttestGuardProofBundle
) {
  return JSON.stringify(
    bundle,
    null,
    2
  );
}
