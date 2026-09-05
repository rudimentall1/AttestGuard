import fs from "node:fs";

import { verifyAttestGuardJson } from "../proof/attestguard-json-verify.js";


const file =
  process.argv[2];


if (!file) {

  console.error(
    "Usage: attestguard inspect <proof.json>"
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


if (!result.valid) {

  console.log(`
ATTESTGUARD INSPECTION

Status:
INVALID

Error:
${result.error ?? "UNKNOWN_ERROR"}
`);

  process.exit(1);
}


const envelope =
  JSON.parse(
    json.replace(/^\uFEFF/, "")
  );


const proof =
  envelope.proof;


console.log(`
ATTESTGUARD INSPECTION

Status:
VALID

Protocol:
${envelope.protocol}

Version:
${envelope.version}

Issuer:
${envelope.issuer}

Created:
${envelope.createdAt}

Proof Type:
${proof.type}

Invoice:
${proof.invoiceId}

Policy:
${proof.decision.policy}

Reason:
${proof.decision.reason}

Risk Tier:
${proof.evidence.riskTier}

AI Authority:
${proof.ai.authority}

AI Recommendation:
${proof.ai.recommendation}

Signature:
${envelope.signature.algorithm}

Proof Hash:
${proof.proofHash}
`);
