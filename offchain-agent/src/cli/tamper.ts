import fs from "node:fs";


const input =
  process.argv[2];


const output =
  process.argv[3] ?? "./tampered-proof.json";


if (!input) {

  console.error(
    "Usage: tamper <input.json> <output.json>"
  );

  process.exit(1);
}


const json =
  fs.readFileSync(
    input,
    "utf8"
  );


const envelope =
  JSON.parse(
    json.replace(/^\uFEFF/, "")
  );


envelope.proof.decision.policy =
  "BLOCK";


fs.writeFileSync(
  output,
  JSON.stringify(
    envelope,
    null,
    2
  )
);


console.log(
  "Tampered proof created:"
);

console.log(
  output
);
