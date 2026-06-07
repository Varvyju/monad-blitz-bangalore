// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * GigProof — Tamper-proof work receipt registry for India's informal workers
 * Deployed on Monad Testnet (Chain ID: 10143)
 *
 * WHAT THIS DOES:
 * 1. Employer deposits MON into escrow when hiring
 * 2. Worker logs work (voice → backend → calls logWork here)
 * 3. Employer approves → escrow auto-releases to worker
 * 4. Receipt hash stored forever on Monad — worker owns proof of work
 *
 * MONAD ADVANTAGE: 0.4s finality, <$0.001 gas per tx
 * A worker gets a payment receipt in under 1 second.
 */
contract GigProof {

    // ─── STRUCTS ────────────────────────────────────────────────────────────

    struct WorkReceipt {
        bytes32 receiptHash;   // keccak256 of job details JSON
        address worker;        // worker wallet
        address employer;      // employer wallet
        uint256 amount;        // payment in MON (wei)
        uint256 timestamp;     // when work was logged
        bool paid;             // has payment been released?
        string ipfsUri;        // optional: link to full receipt JSON (off-chain)
        string workerName;     // display name for UI
        string jobDescription; // job description in English (translated by Sarvam)
    }

    struct WorkerProfile {
        uint256 totalJobs;
        uint256 totalEarned;   // in wei (MON)
        uint256 reputation;    // 0-100, increments per verified job
        bool registered;
    }

    // ─── STATE ───────────────────────────────────────────────────────────────

    // receiptId => WorkReceipt
    mapping(uint256 => WorkReceipt) public receipts;

    // worker address => WorkerProfile
    mapping(address => WorkerProfile) public workerProfiles;

    // worker address => list of their receipt IDs
    mapping(address => uint256[]) public workerReceipts;

    // escrow: employer => (receiptId => amount locked)
    mapping(address => mapping(uint256 => uint256)) public escrow;

    uint256 public receiptCount;

    // ─── EVENTS ──────────────────────────────────────────────────────────────

    event WorkLogged(
        uint256 indexed receiptId,
        address indexed worker,
        address indexed employer,
        uint256 amount,
        bytes32 receiptHash,
        string jobDescription,
        uint256 timestamp
    );

    event EscrowFunded(
        uint256 indexed receiptId,
        address indexed employer,
        uint256 amount
    );

    event PaymentReleased(
        uint256 indexed receiptId,
        address indexed worker,
        uint256 amount,
        uint256 timestamp
    );

    event ReputationUpdated(
        address indexed worker,
        uint256 newReputation,
        uint256 totalJobs
    );

    // ─── ERRORS ──────────────────────────────────────────────────────────────

    error NotEmployer();
    error AlreadyPaid();
    error InsufficientEscrow();
    error TransferFailed();
    error InvalidReceipt();

    // ─── CORE FUNCTIONS ──────────────────────────────────────────────────────

    /**
     * @notice Employer funds escrow AND logs the job in one tx
     * @dev Call this when employer confirms the job
     * @param worker Worker's wallet address
     * @param receiptHash keccak256 hash of the receipt JSON from backend
     * @param jobDescription English job description (Sarvam translated)
     * @param workerName Worker's name (from voice input)
     * @param ipfsUri Optional IPFS link to full receipt
     */
    function fundAndLogWork(
        address worker,
        bytes32 receiptHash,
        string calldata jobDescription,
        string calldata workerName,
        string calldata ipfsUri
    ) external payable returns (uint256 receiptId) {
        require(msg.value > 0, "Must fund escrow");
        require(worker != address(0), "Invalid worker address");

        receiptId = receiptCount++;

        receipts[receiptId] = WorkReceipt({
            receiptHash: receiptHash,
            worker: worker,
            employer: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            paid: false,
            ipfsUri: ipfsUri,
            workerName: workerName,
            jobDescription: jobDescription
        });

        escrow[msg.sender][receiptId] = msg.value;

        // Register worker if first time
        if (!workerProfiles[worker].registered) {
            workerProfiles[worker] = WorkerProfile({
                totalJobs: 0,
                totalEarned: 0,
                reputation: 0,
                registered: true
            });
        }

        workerReceipts[worker].push(receiptId);

        emit WorkLogged(
            receiptId,
            worker,
            msg.sender,
            msg.value,
            receiptHash,
            jobDescription,
            block.timestamp
        );

        emit EscrowFunded(receiptId, msg.sender, msg.value);

        return receiptId;
    }

    /**
     * @notice Employer approves work → payment auto-releases to worker
     * @dev This is the "Pay & Confirm" button in the UI
     * @param receiptId The ID of the receipt to approve
     */
    function approveAndPay(uint256 receiptId) external {
        WorkReceipt storage receipt = receipts[receiptId];

        if (receipt.employer != msg.sender) revert NotEmployer();
        if (receipt.paid) revert AlreadyPaid();
        if (escrow[msg.sender][receiptId] < receipt.amount) revert InsufficientEscrow();

        receipt.paid = true;
        escrow[msg.sender][receiptId] = 0;

        // Update worker reputation and stats
        WorkerProfile storage profile = workerProfiles[receipt.worker];
        profile.totalJobs++;
        profile.totalEarned += receipt.amount;
        // Reputation: increments by 1, caps at 100
        if (profile.reputation < 100) {
            profile.reputation = profile.reputation + 1 > 100
                ? 100
                : profile.reputation + 1;
        }

        emit ReputationUpdated(receipt.worker, profile.reputation, profile.totalJobs);

        // Transfer MON to worker — this is the instant payment
        (bool success, ) = receipt.worker.call{value: receipt.amount}("");
        if (!success) revert TransferFailed();

        emit PaymentReleased(receiptId, receipt.worker, receipt.amount, block.timestamp);
    }

    // ─── VIEW FUNCTIONS ───────────────────────────────────────────────────────

    /**
     * @notice Get all receipt IDs for a worker (for profile page)
     */
    function getWorkerReceiptIds(address worker)
        external view returns (uint256[] memory)
    {
        return workerReceipts[worker];
    }

    /**
     * @notice Get receipt details by ID
     */
    function getReceipt(uint256 receiptId)
        external view returns (WorkReceipt memory)
    {
        return receipts[receiptId];
    }

    /**
     * @notice Get worker's full profile (reputation + earnings)
     */
    function getWorkerProfile(address worker)
        external view returns (WorkerProfile memory)
    {
        return workerProfiles[worker];
    }

    /**
     * @notice Verify a receipt hash matches a given receiptId (for trust verification)
     */
    function verifyReceipt(uint256 receiptId, bytes32 claimedHash)
        external view returns (bool)
    {
        return receipts[receiptId].receiptHash == claimedHash;
    }

    /**
     * @notice Get the total number of receipts (for stats)
     */
    function totalReceipts() external view returns (uint256) {
        return receiptCount;
    }
}
