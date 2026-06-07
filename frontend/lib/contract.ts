// GigProof contract config — update CONTRACT_ADDRESS after deployment

export const GIGPROOF_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://testnet.monadscan.com",
    },
  },
};

// Full ABI — generated from GigProof.sol
export const GIGPROOF_ABI = [
  // fundAndLogWork — employer calls this with MON value
  {
    name: "fundAndLogWork",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "worker", type: "address" },
      { name: "receiptHash", type: "bytes32" },
      { name: "jobDescription", type: "string" },
      { name: "workerName", type: "string" },
      { name: "ipfsUri", type: "string" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  // approveAndPay — employer releases payment to worker
  {
    name: "approveAndPay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "receiptId", type: "uint256" }],
    outputs: [],
  },
  // getWorkerReceiptIds — get all receipt IDs for a worker
  {
    name: "getWorkerReceiptIds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "worker", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  // getReceipt — get single receipt details
  {
    name: "getReceipt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "receiptId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "receiptHash", type: "bytes32" },
          { name: "worker", type: "address" },
          { name: "employer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "paid", type: "bool" },
          { name: "ipfsUri", type: "string" },
          { name: "workerName", type: "string" },
          { name: "jobDescription", type: "string" },
        ],
      },
    ],
  },
  // getWorkerProfile — reputation + earnings
  {
    name: "getWorkerProfile",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "worker", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalJobs", type: "uint256" },
          { name: "totalEarned", type: "uint256" },
          { name: "reputation", type: "uint256" },
          { name: "registered", type: "bool" },
        ],
      },
    ],
  },
  // verifyReceipt — tamper-proof verification
  {
    name: "verifyReceipt",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "receiptId", type: "uint256" },
      { name: "claimedHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  // totalReceipts — global counter
  {
    name: "totalReceipts",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "WorkLogged",
    type: "event",
    inputs: [
      { name: "receiptId", type: "uint256", indexed: true },
      { name: "worker", type: "address", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "receiptHash", type: "bytes32", indexed: false },
      { name: "jobDescription", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PaymentReleased",
    type: "event",
    inputs: [
      { name: "receiptId", type: "uint256", indexed: true },
      { name: "worker", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
];
