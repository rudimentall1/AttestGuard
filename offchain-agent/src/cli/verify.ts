import fs from "node:fs";

import { verifyAttestGuardJson } from "../proof/attestguard-json-verify.js";


const file =
  process.argv[2];


if (!file) {

  console.error(
    "Usage: attestguard verify <proof.json>"
  );

  process.exit(1);
}


const json =
  fs.readFileSync(
    file,
    "utf8"
  );


const result =
  verifyAttestGuardJson(json);


console.log(
`
ATTESTGUARD VERIFICATION

Status:
${result.valid ? "VALID" : "INVALID"}

Issuer:
${result.issuer ?? "unknown"}

Proof Hash:
${result.proofHash ?? "none"}

Error:
${result.error ?? "none"}
`
);


process.exit(
  result.valid ? 0 : 1
);
