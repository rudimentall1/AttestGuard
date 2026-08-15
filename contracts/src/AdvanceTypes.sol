// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Lifecycle of a single trade-finance advance request.
enum AdvanceStatus {
    None, // 0 - does not exist
    Registered, // 1 - invoice registered, waiting for a verified trigger event
    AutoFunded, // 2 - funded automatically (within policy caps)
    PendingConfirmation, // 3 - policy flagged WARN; waiting on a human guardian
    Funded, // 4 - funds released to the supplier
    Rejected, // 5 - guardian rejected, or hard policy rule blocked it
    Repaid // 6 - buyer's repayment was verified on-chain
}

/// @notice A single invoice-financing advance: a supplier ships goods to a
/// buyer and wants an immediate cash advance against the invoice, released
/// the moment delivery/acceptance is verifiably confirmed on the buyer's
/// chain — not when a centralized factoring desk gets around to checking.
struct AdvanceRequest {
    bytes32 invoiceId;
    address supplier; // who gets the advance, on Creditcoin
    address buyer; // whose confirmation event on the source chain triggers funding
    address token; // ERC20 used for the advance, on Creditcoin
    uint256 invoiceAmount; // face value of the invoice
    uint256 requestedAdvanceAmount; // amount the supplier is asking to draw now (<= invoiceAmount)
    uint256 registeredAtBlock;
    AdvanceStatus status;
    string aiRiskNote; // human-readable explanation attached by the off-chain agent (advisory only)
}
