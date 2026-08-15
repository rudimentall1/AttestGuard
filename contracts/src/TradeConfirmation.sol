// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title TradeConfirmation
/// @notice Deployed on the SOURCE chain (e.g. Ethereum Sepolia in this demo,
/// standing in for a buyer's ERP/procurement chain). A buyer calls
/// `confirmDelivery` once goods/services against an invoice are accepted.
/// This contract has no knowledge of Creditcoin, AttestGuard, or any
/// off-chain agent — it just emits a plain, verifiable event. That's the
/// whole point of the Attestcoin Protocol: AttestGuard on Creditcoin can
/// trust this event happened without this contract (or anyone who deployed
/// it) being aware that a decentralized oracle is watching it.
contract TradeConfirmation {
    event DeliveryConfirmed(bytes32 indexed invoiceId, address indexed buyer, address supplier, uint256 amount);

    mapping(bytes32 => bool) public confirmed;

    function confirmDelivery(bytes32 invoiceId, address supplier, uint256 amount) external {
        require(!confirmed[invoiceId], "Already confirmed");
        confirmed[invoiceId] = true;
        emit DeliveryConfirmed(invoiceId, msg.sender, supplier, amount);
    }
}
