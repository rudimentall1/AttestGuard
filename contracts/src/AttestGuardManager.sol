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
/// advances to suppliers on Creditcoin the moment a delivery/acceptance
/// event is cryptographically verified on the buyer's source chain - no
/// centralized oracle, no factoring desk waiting on an email.
///
/// This is deliberately NOT "verify proof -> pay unconditionally". A verified
/// event only tells us the event really happened; it says nothing about
/// whether releasing money right now, in this amount, to this supplier is
/// a good idea. That judgment is the job of the guardrail policy layer
/// below, which is enforced ON-CHAIN so it cannot be skipped by a
/// misbehaving or compromised off-chain agent.
///
/// v2: adds a circuit breaker (Pausable, on the two functions that move
/// funds) and a withdrawLiquidity escape hatch for the owner - see
/// SECURITY.md for why v1 shipped without either and what changed.
contract AttestGuardManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Attestcoin Protocol plumbing
    // ---------------------------------------------------------------

    INativeQueryVerifier public immutable VERIFIER;
    mapping(bytes32 => bool) public processedQueries;

    /// @dev keccak256("DeliveryConfirmed(bytes32,address,address,uint256)")
    bytes32 public constant DELIVERY_CONFIRMED_SIGNATURE =
        0xaa1f52eabee6b1038832c601bbe7c91743c29566c1bb8da851a5bcdc2e35b8f3;

    /// @dev keccak256("RepaymentConfirmed(bytes32,address,address,uint256)")
    bytes32 public constant REPAYMENT_CONFIRMED_SIGNATURE =
        0x618d544cb0d3a5e6e353b1dad5e4173f73d3190e5e5a40359d9e9b49b2e6fb16;

    /// @notice The only source-chain contract whose DeliveryConfirmed and
    /// RepaymentConfirmed events we accept.
    address public sourceConfirmationContract;
    uint64 public sourceChainKey;

    // ---------------------------------------------------------------
    // Trade-finance state
    // ---------------------------------------------------------------

    mapping(bytes32 => AdvanceRequest) public advances;
    IERC20 public immutable ADVANCE_TOKEN;

    // ---------------------------------------------------------------
    // Guardrail policy state (the deterministic, unbypassable layer)
    // ---------------------------------------------------------------

    mapping(address => uint256) public autoApproveCap;
    uint256 public globalMaxAdvance;
    uint256 public perSupplierDailyCap;
    mapping(address => uint256) public suppliersFundedToday;
    mapping(address => uint256) public suppliersDayBucket;
    address public guardianConfirmer;

    uint256 public constant DEFAULT_AUTO_APPROVE_CAP = 500 ether;
    uint256 public constant AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT = 250 ether;
    uint256 public constant SECONDS_PER_DAY = 1 days;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

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

    error QueryAlreadyProcessed();
    error ProofVerificationFailed();
    error TransactionDidNotSucceed();
    error NoMatchingDeliveryEvent();
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

    // ---------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------

    function registerSourceConfirmationContract(address sourceContract) external onlyOwner {
        sourceConfirmationContract = sourceContract;
        emit SourceConfirmationContractRegistered(sourceContract, sourceChainKey);
    }

    function setGuardianConfirmer(address guardian) external onlyOwner {
        guardianConfirmer = guardian;
        emit GuardianConfirmerUpdated(guardian);
    }

    function setGlobalMaxAdvance(uint256 amount) external onlyOwner {
        globalMaxAdvance = amount;
    }

    function setPerSupplierDailyCap(uint256 amount) external onlyOwner {
        perSupplierDailyCap = amount;
    }

    /// @notice Fund the manager's vault. Anyone can top it up; only
    /// policy-approved advances can draw it down.
    function depositLiquidity(uint256 amount) external {
        ADVANCE_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Escape hatch for liquidity that was deposited but never drawn
    /// down by a funded advance. Owner-only pooled demo/testnet liquidity,
    /// not a vault with individual depositor claims.
    function withdrawLiquidity(uint256 amount) external onlyOwner {
        ADVANCE_TOKEN.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    /// @notice Circuit breaker. Halts fundAdvanceFromQuery and
    /// confirmPendingAdvance - the two functions that move funds out of the
    /// vault - without touching registration, rejection, or view functions.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------
    // Step 1: register an invoice / advance request
    // ---------------------------------------------------------------

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

    // ---------------------------------------------------------------
    // Step 2: fund an advance from a verified cross-chain proof
    // ---------------------------------------------------------------

    /// @notice Called by the off-chain agent once it has a proof that the
    /// buyer's DeliveryConfirmed event for this invoice really happened on
    /// the source chain.
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

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, DELIVERY_CONFIRMED_SIGNATURE);
        if (logs.length == 0) revert NoMatchingDeliveryEvent();

        bool matched = false;
        for (uint256 i = 0; i < logs.length; i++) {
            EvmV1Decoder.LogEntry memory log = logs[i];
            if (log.address_ != sourceConfirmationContract) continue;
            if (log.topics.length < 3) continue;
            if (log.topics[1] != advance.invoiceId) continue;
            if (address(uint160(uint256(log.topics[2]))) != advance.buyer) continue;
            matched = true;
            break;
        }
        if (!matched) revert NoMatchingDeliveryEvent();
    }

    // ---------------------------------------------------------------
    // The guardrail policy gate - this is the part that cannot be skipped
    // ---------------------------------------------------------------

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

    /// @notice Human-in-the-loop path for advances the on-chain policy
    /// flagged as WARN. Only guardianConfirmer can release these funds.
    function confirmPendingAdvance(bytes32 invoiceId) external nonReentrant whenNotPaused {
        if (msg.sender != guardianConfirmer) revert NotGuardianConfirmer();
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.PendingConfirmation) revert AdvanceNotPending();

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

    /// @notice Called once a buyer's RepaymentConfirmed event for this
    /// invoice has been cryptographically proven on the source chain - the
    /// same proof-gated pattern as fundAdvanceFromQuery, not owner
    /// discretion. This is deliberately NOT onlyOwner: exactly like
    /// funding, the verified proof is what authorizes this call, not the
    /// identity of whoever submits it. Anyone (typically the off-chain
    /// agent) can call this once they have a valid proof; the contract
    /// re-derives everything itself and does not trust the caller's word
    /// on any of it.
    ///
    /// This closes the gap documented in docs/adr/0005: previously,
    /// acknowledgeRepayment was a plain onlyOwner call with no proof
    /// requirement, meaning supplier reputation (autoApproveCap growth)
    /// was owner-attested, not cryptographically verified - inconsistent
    /// with how funding itself works. It no longer is.
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

        uint256 repaidAmount = _validateRepaymentEvent(encodedTransaction, advance);
        if (repaidAmount < advance.requestedAdvanceAmount) {
            revert RepaymentAmountTooLow(repaidAmount, advance.requestedAdvanceAmount);
        }

        advance.status = AdvanceStatus.Repaid;
        uint256 newCap = autoApproveCap[advance.supplier] + AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT;
        autoApproveCap[advance.supplier] = newCap;

        emit RepaymentAcknowledged(invoiceId, advance.supplier, newCap);
        emit AutoApproveCapUpdated(advance.supplier, newCap);
    }

    /// @dev Mirrors _validateDeliveryEvent's structure exactly, but looks
    /// for REPAYMENT_CONFIRMED_SIGNATURE instead of DELIVERY_CONFIRMED_SIGNATURE,
    /// and - unlike delivery confirmation - actually decodes and returns the
    /// event's amount field, because the repayment amount is the whole
    /// point of this check (see docs/adr/0006 for why this differs from the
    /// delivery path, where the event's amount is deliberately ignored).
    function _validateRepaymentEvent(bytes memory encodedTransaction, AdvanceRequest storage advance)
        internal view returns (uint256 repaidAmount)
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionDidNotSucceed();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, REPAYMENT_CONFIRMED_SIGNATURE);
        if (logs.length == 0) revert NoMatchingRepaymentEvent();

        for (uint256 i = 0; i < logs.length; i++) {
            EvmV1Decoder.LogEntry memory log = logs[i];
            if (log.address_ != sourceConfirmationContract) continue;
            if (log.topics.length < 3) continue;
            if (log.topics[1] != advance.invoiceId) continue;
            if (address(uint160(uint256(log.topics[2]))) != advance.buyer) continue;

            (, uint256 amount) = abi.decode(log.data, (address, uint256));
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

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    function getAdvance(bytes32 invoiceId) external view returns (AdvanceRequest memory) {
        return advances[invoiceId];
    }
}
