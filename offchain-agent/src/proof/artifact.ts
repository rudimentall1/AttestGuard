import fs from "node:fs";
import type { AttestGuardProofBundle } from "./proof-bundle.js";

export function writeProofBundleArtifact(
  path: string,
  bundle: AttestGuardProofBundle
): void {
  const directory = path.replace(/[\\/][^\\/]+$/, "");

  if (directory && !fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(
    path,
    JSON.stringify(bundle, null, 2),
    "utf8"
  );
}
