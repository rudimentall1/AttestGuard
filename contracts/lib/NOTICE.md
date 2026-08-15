# Third-party attribution

`VerifierInterface.sol` in this directory is adapted from Creditcoin's
official reference examples:

- Repository: https://github.com/gluwa/usc-testnet-bridge-examples
- License: Apache License 2.0
- File of origin: `contracts/sol/VerifierInterface.sol`

It is the interface to the Block Prover Precompile (address `0x0FD2`) that
ships as a native part of the Creditcoin runtime, as documented at
https://docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.
Reused here unmodified (interface + address constant only — no business
logic) under the terms of the Apache-2.0 license, with the original
copyright and license notice preserved in this NOTICE file. All business
logic in `contracts/src/` is original work written for this submission.
