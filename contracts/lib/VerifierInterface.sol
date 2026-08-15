// SPDX-License-Identifier: Apache-2.0
// Adapted from gluwa/usc-testnet-bridge-examples (Apache-2.0), per Creditcoin's
// Attestcoin Smart Contract documentation:
// https://docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts
//
// This is the interface to Creditcoin's Block Prover Precompile, a native
// runtime component that synchronously verifies Merkle inclusion proofs and
// continuity (attestation-chain) proofs for transactions on supported source
// chains. It is what lets a contract on Creditcoin trust "this transaction
// really happened on chain X" without a centralized oracle operator.
pragma solidity ^0.8.23;

interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    function calculateTxIndex(MerkleProof calldata merkle_proof) external view returns (uint64);
}

library NativeQueryVerifierLib {
    // Block Prover Precompile address on Creditcoin (0x0FD2 == 4050 decimal).
    address constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;

    function getVerifier() internal pure returns (INativeQueryVerifier) {
        return INativeQueryVerifier(PRECOMPILE_ADDRESS);
    }
}
