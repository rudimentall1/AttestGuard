// Standalone compiler check: compiles contracts/src/*.sol with solc-js,
// resolving imports from node_modules. Used because this sandbox's network
// allowlist blocks binaries.soliditylang.org (which Hardhat's own compiler
// downloader needs); a normal dev machine or CI runner just uses
// `npx hardhat compile` directly and does not need this script.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = __dirname + "/..";
const SRC_DIR = path.join(ROOT, "contracts", "src");

function findImports(importPath) {
  const candidates = [
    path.join(ROOT, importPath),
    path.join(SRC_DIR, importPath),
    path.join(ROOT, "node_modules", importPath),
  ];
  for (const c of candidates) {
    try {
      return { contents: fs.readFileSync(c, "utf8") };
    } catch (e) {
      /* try next */
    }
  }
  return { error: "File not found: " + importPath };
}

const targets = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".sol"))
  .map((f) => path.join(SRC_DIR, f));

const sources = {};
for (const t of targets) {
  const rel = path.relative(ROOT, t);
  sources[rel] = { content: fs.readFileSync(t, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    const stream = err.severity === "error" ? console.error : console.warn;
    stream(err.formattedMessage);
    if (err.severity === "error") hasError = true;
  }
}

if (hasError) {
  console.error("\nCompilation FAILED.");
  process.exit(1);
}

console.log("\nCompilation OK. Contracts:");
for (const file of Object.keys(output.contracts || {})) {
  for (const name of Object.keys(output.contracts[file])) {
    const bytecodeLen = output.contracts[file][name].evm.bytecode.object.length / 2;
    console.log(`  - ${file}:${name}  (${bytecodeLen} bytes runtime+init)`);
  }
}

fs.mkdirSync(path.join(ROOT, "contracts", "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "contracts", "out", "compile-output.json"), JSON.stringify(output, null, 2));
