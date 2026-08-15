// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A plain mintable-at-deploy ERC20 standing in for a stablecoin,
/// used only so this demo can be stood up on testnet without depending on
/// a specific existing stablecoin deployment. Not intended for anything
/// beyond hackathon/demo use.
contract DemoAdvanceToken is ERC20 {
    constructor(address initialHolder, uint256 initialSupply) ERC20("AttestGuard Demo USD", "aUSD") {
        _mint(initialHolder, initialSupply);
    }
}
