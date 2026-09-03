// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../lib/VerifierInterface.sol";
import {AdvanceRequest, AdvanceStatus} from "./AdvanceTypes.sol";

/// @title AttestGuardManager
/// @notice An Attestcoin Smart Contract (ASC) that releases trade-finance
/// advances to suppliers the moment a delivery/acceptance event is
/// cryptographically verified on the buyer's source chain.
contract AttestGuardManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    INativeQueryVerifier public immutable VERIFIER;
    mapping(bytes32 => bool) public processedQueries;

    bytes32 public constant DELIVERY_CONFIRMED_SIGNATURE =
        0xaa1f52eabee6b1038832c601bbe7c91743c29566c1bb8da851a5bcdc2e35b8f3;
    bytes32 public constant REPAYMENT_CONFIRMED_SIGNATURE =
        0x618d544cb0d3a5e6e353b1dad5e4173f73d3190e5e5a40359d9e9b49b2e6fb16;

    address public sourceConfirmationContract;
    uint64 public sourceChainKey;

    mapping(bytes32 => AdvanceRequest) public advances;
    mapping(bytes32 => bytes32) public underwritingDecisionHash;
    IERC20 public immutable ADVANCE_TOKEN;

    mapping(address => uint256) public autoApproveCap;
    uint256 public globalMaxAdvance;
    uint256 public perSupplierDailyCap;
    mapping(address => uint256) public suppliersFundedToday;
    mapping(address => uint256) public suppliersDayBucket;
    address public guardianConfirmer;

    uint256 public constant DEFAULT_AUTO_APPROVE_CAP = 500 ether;
    uint256 public constant AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT = 250 ether;
    uint256 public constant SECONDS_PER_DAY = 1 days;

    event SourceConfirmationContractRegistered(address indexed sourceContract, uint64 chainKey);
    event AdvanceRegistered(bytes32 indexed invoiceId, address indexed supplier, address indexed buyer, uint256 requestedAmount);
    event AdvanceAutoFunded(bytes32 indexed invoiceId, address indexed supplier, uint256 amount);
    event AdvanceFlaggedForConfirmation(bytes32 indexed invoiceId, address indexed supplier, uint256 amount, string reason);
    event AdvanceConfirmed(bytes32 indexed invoiceId, address indexed guardian);
    event AdvanceRejected(bytes32 indexed invoiceId, address indexed rejectedBy, string reason);
    event RepaymentAcknowledged(bytes32 indexed invoiceId, address indexed supplier, uint256 newAutoApproveCap);
    event AutoApproveCapUpdated(address indexed supplier, uint256 newCap);
    event GuardianConfirmerUpdated(address indexed newGuardian);
    event LiquidityWithdrawn(address indexed to, uint256 amount);
    event UnderwritingDecisionRecorded(bytes32 indexed invoiceId, bytes32 indexed decisionHash);

    error QueryAlreadyProcessed();
    error ProofVerificationFailed();
    error TransactionDidNotSucceed();
    error NoMatchingDeliveryEvent();
    error DeliveryAmountMismatch();
    error NoMatchingRepaymentEvent();
    error RepaymentAmountTooLow(uint256 provided, uint256 required);
    error UnknownAdvance();
    error AdvanceNotPending();
    error NotGuardianConfirmer();
    error AboveGlobalMax();

    constructor(address advanceToken_, uint64 sourceChainKey_, uint256 globalMaxAdvance_, uint256 perSupplierDailyCap_)
        Ownable(msg.sender)
    {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
        ADVANCE_TOKEN = IERC20(advanceToken_);
        sourceChainKey = sourceChainKey_;
        globalMaxAdvance = globalMaxAdvance_;
        perSupplierDailyCap = perSupplierDailyCap_;
        guardianConfirmer = msg.sender;
    }

    function registerSourceConfirmationContract(address sourceContract) external onlyOwner {
        sourceConfirmationContract = sourceContract;
        emit SourceConfirmationContractRegistered(sourceContract, sourceChainKey);
    }

    function setGuardianConfirmer(address guardian) external onlyOwner {
        guardianConfirmer = guardian;
        emit GuardianConfirmerUpdated(guardian);
    }

    function setGlobalMaxAdvance(uint256 amount) external onlyOwner { globalMaxAdvance = amount; }
    function setPerSupplierDailyCap(uint256 amount) external onlyOwner { perSupplierDailyCap = amount; }

    function depositLiquidity(uint256 amount) external {
        ADVANCE_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawLiquidity(uint256 amount) external onlyOwner {
        ADVANCE_TOKEN.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function registerAdvance(
        bytes32 invoiceId,
        address supplier,
        address buyer,
        uint256 invoiceAmount,
        uint256 requestedAdvanceAmount,
        string calldata aiRiskNote
    ) external onlyOwner {
        require(advances[invoiceId].status == AdvanceStatus.None, "Invoice already registered");
        require(requestedAdvanceAmount <= invoiceAmount, "Advance cannot exceed invoice amount");

        advances[invoiceId] = AdvanceRequest({
            invoiceId: invoiceId,
            supplier: supplier,
            buyer: buyer,
            token: address(ADVANCE_TOKEN),
            invoiceAmount: invoiceAmount,
            requestedAdvanceAmount: requestedAdvanceAmount,
            registeredAtBlock: block.number,
            status: AdvanceStatus.Registered,
            aiRiskNote: aiRiskNote
        });

        if (autoApproveCap[supplier] == 0) {
            autoApproveCap[supplier] = DEFAULT_AUTO_APPROVE_CAP;
            emit AutoApproveCapUpdated(supplier, DEFAULT_AUTO_APPROVE_CAP);
        }
        emit AdvanceRegistered(invoiceId, supplier, buyer, requestedAdvanceAmount);
    }

    /// @notice Records the bounded underwriting decision associated with an invoice.
    /// This is an auditable one-time commitment. The contract does not claim to
    /// cryptographically verify the off-chain AI output itself; proof verification
    /// and deterministic funding policy remain independent on-chain controls.
    function recordUnderwritingDecision(bytes32 invoiceId, bytes32 decisionHash) external onlyOwner {
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.Registered) revert AdvanceNotPending();
        require(decisionHash != bytes32(0), "Empty decision hash");
        require(underwritingDecisionHash[invoiceId] == bytes32(0), "Decision already recorded");
        underwritingDecisionHash[invoiceId] = decisionHash;
        emit UnderwritingDecisionRecorded(invoiceId, decisionHash);
    }

    function fundAdvanceFromQuery(
        bytes32 invoiceId,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external nonReentrant whenNotPaused returns (bool autoFunded) {
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.Registered) revert AdvanceNotPending();

        uint256 txIndex = VERIFIER.calculateTxIndex(
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings})
        );
        bytes32 queryId = keccak256(abi.encodePacked(sourceChainKey, blockHeight, txIndex));
        if (processedQueries[queryId]) revert QueryAlreadyProcessed();

        bool verified = VERIFIER.verifyAndEmit(
            sourceChainKey,
            blockHeight,
            encodedTransaction,
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings}),
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots})
        );
        if (!verified) revert ProofVerificationFailed();
        processedQueries[queryId] = true;
        _validateDeliveryEvent(encodedTransaction, advance);
        return _applyPolicyAndMaybeFund(advance);
    }

    function _validateDeliveryEvent(bytes memory encodedTransaction, AdvanceRequest storage advance) internal view {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionDidNotSucceed();
        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, DELIVERY_CONFIRMED_SIGNATURE);
        if (logs.length == 0) revert NoMatchingDeliveryEvent();
        bool matched = false;
        for (uint256 i = 0; i < logs.length; i++) {
            EvmV1Decoder.LogEntry memory log = logs[i];
            if (log.address_ != sourceConfirmationContract) continue;
            if (log.topics.length < 3) continue;
            if (log.topics[1] != advance.invoiceId) continue;
            if (address(uint160(uint256(log.topics[2]))) != advance.buyer) continue;
            (address eventSupplier, uint256 eventAmount) = abi.decode(log.data, (address, uint256));
            if (eventSupplier != advance.supplier) continue;
            if (eventAmount != advance.invoiceAmount) revert DeliveryAmountMismatch();
            matched = true;
            break;
        }
        if (!matched) revert NoMatchingDeliveryEvent();
    }

    function _applyPolicyAndMaybeFund(AdvanceRequest storage advance) internal returns (bool autoFunded) {
        uint256 amount = advance.requestedAdvanceAmount;
        address supplier = advance.supplier;
        if (amount > globalMaxAdvance) revert AboveGlobalMax();
        _rollDailyBucketIfNeeded(supplier);
        bool withinAutoCap = amount <= autoApproveCap[supplier];
        bool withinDailyCap = suppliersFundedToday[supplier] + amount <= perSupplierDailyCap;
        if (withinAutoCap && withinDailyCap) {
            suppliersFundedToday[supplier] += amount;
            ADVANCE_TOKEN.safeTransfer(supplier, amount);
            advance.status = AdvanceStatus.Funded;
            emit AdvanceAutoFunded(advance.invoiceId, supplier, amount);
            return true;
        }
        advance.status = AdvanceStatus.PendingConfirmation;
        string memory reason = !withinAutoCap
            ? "requested amount exceeds supplier auto-approve cap"
            : "supplier daily funding cap reached";
        emit AdvanceFlaggedForConfirmation(advance.invoiceId, supplier, amount, reason);
        return false;
    }

    /// @notice Human-in-the-loop path for advances flagged as WARN.
    /// The guardian may override the supplier auto-approve cap and daily cap,
    /// but can NEVER override the global hard maximum. This keeps the human
    /// override useful while preserving the strongest deterministic limit.
    function confirmPendingAdvance(bytes32 invoiceId) external nonReentrant whenNotPaused {
        if (msg.sender != guardianConfirmer) revert NotGuardianConfirmer();
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.PendingConfirmation) revert AdvanceNotPending();

        if (advance.requestedAdvanceAmount > globalMaxAdvance) revert AboveGlobalMax();

        _rollDailyBucketIfNeeded(advance.supplier);
        suppliersFundedToday[advance.supplier] += advance.requestedAdvanceAmount;

        advance.status = AdvanceStatus.Funded;
        ADVANCE_TOKEN.safeTransfer(advance.supplier, advance.requestedAdvanceAmount);
        emit AdvanceConfirmed(invoiceId, msg.sender);
    }

    function rejectPendingAdvance(bytes32 invoiceId, string calldata reason) external {
        if (msg.sender != guardianConfirmer && msg.sender != owner()) revert NotGuardianConfirmer();
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.PendingConfirmation) revert AdvanceNotPending();
        advance.status = AdvanceStatus.Rejected;
        emit AdvanceRejected(invoiceId, msg.sender, reason);
    }

    function acknowledgeRepaymentFromQuery(
        bytes32 invoiceId,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external nonReentrant whenNotPaused {
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.Funded) revert UnknownAdvance();
        uint256 txIndex = VERIFIER.calculateTxIndex(INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings}));
        bytes32 queryId = keccak256(abi.encodePacked(sourceChainKey, blockHeight, txIndex));
        if (processedQueries[queryId]) revert QueryAlreadyProcessed();
        bool verified = VERIFIER.verifyAndEmit(
            sourceChainKey,
            blockHeight,
            encodedTransaction,
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings}),
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots})
        );
        if (!verified) revert ProofVerificationFailed();
        processedQueries[queryId] = true;
        uint256 repaidAmount = _validateRepaymentEvent(encodedTransaction, advance);
        if (repaidAmount < advance.requestedAdvanceAmount) revert RepaymentAmountTooLow(repaidAmount, advance.requestedAdvanceAmount);
        advance.status = AdvanceStatus.Repaid;
        uint256 newCap = autoApproveCap[advance.supplier] + AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT;
        autoApproveCap[advance.supplier] = newCap;
        emit RepaymentAcknowledged(invoiceId, advance.supplier, newCap);
        emit AutoApproveCapUpdated(advance.supplier, newCap);
    }

    function _validateRepaymentEvent(bytes memory encodedTransaction, AdvanceRequest storage advance)
        internal view returns (uint256 repaidAmount)
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionDidNotSucceed();
        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, REPAYMENT_CONFIRMED_SIGNATURE);
        if (logs.length == 0) revert NoMatchingRepaymentEvent();
        for (uint256 i = 0; i < logs.length; i++) {
            EvmV1Decoder.LogEntry memory log = logs[i];
            if (log.address_ != sourceConfirmationContract) continue;
            if (log.topics.length < 3) continue;
            if (log.topics[1] != advance.invoiceId) continue;
            if (address(uint160(uint256(log.topics[2]))) != advance.buyer) continue;
            (address eventSupplier, uint256 amount) = abi.decode(log.data, (address, uint256));
            if (eventSupplier != advance.supplier) continue;
            return amount;
        }
        revert NoMatchingRepaymentEvent();
    }

    function _rollDailyBucketIfNeeded(address supplier) internal {
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        if (suppliersDayBucket[supplier] != today) {
            suppliersDayBucket[supplier] = today;
            suppliersFundedToday[supplier] = 0;
        }
    }

    function getAdvance(bytes32 invoiceId) external view returns (AdvanceRequest memory) {
        return advances[invoiceId];
    }
}