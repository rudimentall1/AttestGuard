// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title TradeConfirmation
/// @notice Deployed on the SOURCE chain (e.g. Ethereum Sepolia in this demo,
/// standing in for a buyer's ERP/procurement chain). A buyer calls
/// confirmDelivery once goods/services against an invoice are accepted,
/// and confirmRepayment once they've paid the invoice back in full. This
/// contract has no knowledge of Creditcoin, AttestGuard, or any off-chain
/// agent - it just emits plain, verifiable events. That's the whole point
/// of the Attestcoin Protocol: AttestGuard on Creditcoin can trust these
/// events happened without this contract (or anyone who deployed it) being
/// aware that a decentralized oracle is watching it.
contract TradeConfirmation {
    event DeliveryConfirmed(bytes32 indexed invoiceId, address indexed buyer, address supplier, uint256 amount);
    event RepaymentConfirmed(bytes32 indexed invoiceId, address indexed buyer, address supplier, uint256 amount);

    mapping(bytes32 => bool) public confirmed;
    mapping(bytes32 => bool) public repaymentConfirmed;

    function confirmDelivery(bytes32 invoiceId, address supplier, uint256 amount) external {
        require(!confirmed[invoiceId], "Already confirmed");
        confirmed[invoiceId] = true;
        emit DeliveryConfirmed(invoiceId, msg.sender, supplier, amount);
    }

    /// @notice Called by the buyer once they've paid back the advance in
    /// full. This is deliberately a separate function/event from
    /// confirmDelivery, not a reuse of the same one - delivery and
    /// repayment are different real-world events with different timing,
    /// and AttestGuardManager needs to tell them apart unambiguously when
    /// decoding a proof (see REPAYMENT_CONFIRMED_SIGNATURE).
    function confirmRepayment(bytes32 invoiceId, address supplier, uint256 amount) external {
        require(confirmed[invoiceId], "Delivery was never confirmed for this invoice");
        require(!repaymentConfirmed[invoiceId], "Repayment already confirmed");
        repaymentConfirmed[invoiceId] = true;
        emit RepaymentConfirmed(invoiceId, msg.sender, supplier, amount);
    }
}
