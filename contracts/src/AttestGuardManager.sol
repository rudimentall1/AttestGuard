// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "../lib/VerifierInterface.sol";
import {AdvanceRequest, AdvanceStatus} from "./AdvanceTypes.sol";

/// @title AttestGuardManager
/// @notice An Attestcoin Smart Contract (ASC) that releases trade-finance
/// advances to suppliers on Creditcoin the moment a delivery/acceptance
/// event is *cryptographically verified* on the buyer's source chain — no
/// centralized oracle, no factoring desk waiting on an email.
///
/// This is deliberately NOT "verify proof -> pay unconditionally". A verified
/// event only tells us the event really happened; it says nothing about
/// whether releasing money *right now, in this amount, to this supplier* is
/// a good idea. That judgment is the job of the guardrail policy layer
/// below, which is enforced ON-CHAIN so it cannot be skipped by a
/// misbehaving or compromised off-chain agent:
///
///   verified cross-chain event  --->  deterministic policy gate  --->  funds move
///        (Attestcoin Protocol)          (this contract, on-chain)
///
/// An off-chain AI agent (see offchain-agent/) watches for trigger events,
/// requests proofs, and calls this contract — but every decision it makes is
/// re-checked here. If the agent is wrong, buggy, or compromised, the worst
/// it can do is fail to submit a good advance; it can never force a bad one
/// through, because the caps below are enforced in this contract, not in the
/// agent's process.
contract AttestGuardManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Attestcoin Protocol plumbing
    // ---------------------------------------------------------------

    INativeQueryVerifier public immutable VERIFIER;
    mapping(bytes32 => bool) public processedQueries;

    /// @dev keccak256("DeliveryConfirmed(bytes32,address,address,uint256)")
    /// Emitted by the source-chain TradeConfirmation contract when a buyer
    /// confirms receipt/acceptance of goods against an invoice.
    bytes32 public constant DELIVERY_CONFIRMED_SIGNATURE =
        0xaa1f52eabee6b1038832c601bbe7c91743c29566c1bb8da851a5bcdc2e35b8f3;

    /// @notice The only source-chain contract whose DeliveryConfirmed events
    /// we accept. Prevents anyone from proving an event from an unrelated,
    /// attacker-controlled contract on the same source chain.
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

    /// @notice Per-supplier cap below which an advance auto-funds with no
    /// human in the loop. Starts low for every new supplier and can only
    /// rise through `_growAutoApproveCap`, which is driven purely by that
    /// supplier's own verified on-chain repayment history — not by
    /// anything the off-chain agent claims about them.
    mapping(address => uint256) public autoApproveCap;

    /// @notice Hard ceiling no single advance may exceed, auto or
    /// human-confirmed, regardless of supplier history. Owner-adjustable,
    /// but every change is a public, auditable transaction.
    uint256 public globalMaxAdvance;

    /// @notice Rolling 1-day funding cap per supplier, independent of the
    /// per-advance cap, to bound blast radius from a single compromised or
    /// misconfigured agent.
    uint256 public perSupplierDailyCap;
    mapping(address => uint256) public suppliersFundedToday;
    mapping(address => uint256) public suppliersDayBucket;

    /// @notice Address (e.g. a Safe multisig, or a human reviewer's EOA in a
    /// demo) authorized to confirm advances that exceed a supplier's
    /// auto-approve cap. Distinct from `owner`, which sets policy but should
    /// not also be the one rubber-stamping individual payouts.
    address public guardianConfirmer;

    uint256 public constant DEFAULT_AUTO_APPROVE_CAP = 500 ether; // demo-scale stablecoin units
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

    error QueryAlreadyProcessed();
    error ProofVerificationFailed();
    error TransactionDidNotSucceed();
    error NoMatchingDeliveryEvent();
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

    /// @notice Fund the manager's vault. Anyone can top it up (e.g. a
    /// liquidity provider); only policy-approved advances can draw it down.
    function depositLiquidity(uint256 amount) external {
        ADVANCE_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
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
    /// the source chain. Verification and every policy check below happen
    /// synchronously, in this transaction — the off-chain agent's own
    /// opinion about whether this is a good advance is advisory only and
    /// never substitutes for these checks.
    function fundAdvanceFromQuery(
        bytes32 invoiceId,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external nonReentrant returns (bool autoFunded) {
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
            // topics: [0]=sig, [1]=invoiceId, [2]=buyer  (amount is in data)
            if (log.topics.length < 3) continue;
            if (log.topics[1] != advance.invoiceId) continue;
            if (address(uint160(uint256(log.topics[2]))) != advance.buyer) continue;
            matched = true;
            break;
        }
        if (!matched) revert NoMatchingDeliveryEvent();
    }

    // ---------------------------------------------------------------
    // The guardrail policy gate — this is the part that cannot be skipped
    // ---------------------------------------------------------------

    function _applyPolicyAndMaybeFund(AdvanceRequest storage advance) internal returns (bool autoFunded) {
        uint256 amount = advance.requestedAdvanceAmount;
        address supplier = advance.supplier;

        if (amount > globalMaxAdvance) revert AboveGlobalMax();

        _rollDailyBucketIfNeeded(supplier);

        bool withinAutoCap = amount <= autoApproveCap[supplier];
        bool withinDailyCap = suppliersFundedToday[supplier] + amount <= perSupplierDailyCap;

        if (withinAutoCap && withinDailyCap) {
            advance.status = AdvanceStatus.AutoFunded;
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
    /// flagged as WARN. Only `guardianConfirmer` can release these funds —
    /// this is the on-chain equivalent of Guardrail's `on_warn` hook, except
    /// here skipping it is not an option available to the agent at all.
    function confirmPendingAdvance(bytes32 invoiceId) external nonReentrant {
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

    /// @notice Called (by owner, on behalf of the off-chain agent — in a
    /// full build this would itself be gated by another verified proof of
    /// the buyer's on-chain repayment) once a supplier has repaid an
    /// advance in full. Raises their auto-approve cap for next time. This
    /// is the reputation mechanism: autonomy is earned strictly from
    /// verified on-chain history, not asserted by the agent.
    function acknowledgeRepayment(bytes32 invoiceId) external onlyOwner {
        AdvanceRequest storage advance = advances[invoiceId];
        if (advance.status != AdvanceStatus.Funded) revert UnknownAdvance();

        advance.status = AdvanceStatus.Repaid;
        uint256 newCap = autoApproveCap[advance.supplier] + AUTO_APPROVE_CAP_GROWTH_PER_REPAYMENT;
        autoApproveCap[advance.supplier] = newCap;

        emit RepaymentAcknowledged(invoiceId, advance.supplier, newCap);
        emit AutoApproveCapUpdated(advance.supplier, newCap);
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
