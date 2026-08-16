// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {INativeQueryVerifier} from "../lib/VerifierInterface.sol";

/// @title MockNativeQueryVerifier
/// @notice TEST-ONLY. Stands in for Creditcoin's real Block Prover precompile
/// (address 0x0FD2), which only exists on an actual Creditcoin node and
/// therefore isn't present in Hardhat's in-memory EVM. This mock always
/// reports proofs as valid - it does NOT re-implement Merkle/continuity
/// verification - so tests using it exercise AttestGuardManager's own logic
/// (decoding, policy gate, state transitions), not Attestcoin's proof math.
///
/// Deployed normally via a factory, then its bytecode is copied onto the
/// real precompile address with hardhat_setCode - see
/// contracts-test/AttestGuardManager.e2e.test.ts.
///
/// This contract is never deployed anywhere real; it exists purely so the
/// test suite doesn't have to fake a happy path it can't actually execute.
contract MockNativeQueryVerifier is INativeQueryVerifier {
    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external pure returns (bool) {
        return true;
    }

    /// @dev Deterministic from the merkle root only, so distinct test cases
    /// (which use distinct fake roots) get distinct tx indices and
    /// therefore distinct queryIds - letting replay-protection tests use a
    /// SAME root on purpose to trigger QueryAlreadyProcessed.
    function calculateTxIndex(MerkleProof calldata merkle_proof) external pure returns (uint64) {
        return uint64(uint256(merkle_proof.root));
    }
}
