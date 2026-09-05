import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function importProofBundle(
  json: string
): AttestGuardProofBundle {

  const parsed = JSON.parse(json);

  return parsed as AttestGuardProofBundle;
}
