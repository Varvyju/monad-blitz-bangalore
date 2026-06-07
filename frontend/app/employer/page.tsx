"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { GIGPROOF_ABI, GIGPROOF_ADDRESS } from "../../lib/contract";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface Receipt {
  receiptId: number;
  workerAddress: string;
  workerName: string;
  jobDescription: string;
  amount: string; // in ETH/MON
  timestamp: number;
  paid: boolean;
  receiptHash: string;
}

export default function EmployerPage() {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [txHashes, setTxHashes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>("");

  // ─── Connect wallet ──────────────────────────────────────────────────────

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      setError("Please install MetaMask");
      return;
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    setWalletAddress(address);
    await loadPendingReceipts(address);
  };

  // ─── Load receipts where this employer has pending payments ──────────────

  const loadPendingReceipts = async (employerAddr: string) => {
    try {
      setLoading(true);
      const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
      const contract = new ethers.Contract(GIGPROOF_ADDRESS, GIGPROOF_ABI, provider);

      // Get total receipts count and scan for employer's receipts
      // In production: use an indexer or event filtering
      const total = await contract.totalReceipts();
      const pending: Receipt[] = [];

      // Scan last 50 receipts (demo optimization)
      const start = Math.max(0, Number(total) - 50);
      for (let i = start; i < Number(total); i++) {
        const r = await contract.getReceipt(i);
        if (r.employer.toLowerCase() === employerAddr.toLowerCase() && !r.paid) {
          pending.push({
            receiptId: i,
            workerAddress: r.worker,
            workerName: r.workerName,
            jobDescription: r.jobDescription,
            amount: ethers.formatEther(r.amount),
            timestamp: Number(r.timestamp),
            paid: r.paid,
            receiptHash: r.receiptHash,
          });
        }
      }

      setReceipts(pending);
    } catch (err: any) {
      setError("Failed to load receipts: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Approve + Pay worker ─────────────────────────────────────────────────

  const approveAndPay = async (receiptId: number) => {
    try {
      setApproving(receiptId);
      setError("");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(GIGPROOF_ADDRESS, GIGPROOF_ABI, signer);

      const tx = await contract.approveAndPay(receiptId);
      console.log("⏳ Approval tx:", tx.hash);

      await tx.wait();

      setTxHashes((prev) => ({ ...prev, [receiptId]: tx.hash }));

      // Update local state
      setReceipts((prev) =>
        prev.map((r) => (r.receiptId === receiptId ? { ...r, paid: true } : r))
      );
    } catch (err: any) {
      setError(err.message || "Approval failed");
    } finally {
      setApproving(null);
    }
  };

  // ─── Quick-add a new job (demo flow for judges) ───────────────────────────

  const [showAddJob, setShowAddJob] = useState(false);
  const [newJob, setNewJob] = useState({
    workerAddress: "",
    workerName: "",
    jobDescription: "",
    amountMON: "0.05",
  });

  const addJobManually = async () => {
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(GIGPROOF_ADDRESS, GIGPROOF_ABI, signer);

      // Create receipt hash from job details
      const receiptData = {
        workerName: newJob.workerName,
        jobDescription: newJob.jobDescription,
        amount: parseFloat(newJob.amountMON) * 100, // demo: 1 MON = ₹100
        location: "Demo site",
        date: new Date().toISOString().split("T")[0],
        extractedAt: new Date().toISOString(),
      };

      const hashRes = await fetch(`${BACKEND_URL}/api/hash-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: receiptData }),
      });
      const { hash } = await hashRes.json();

      const tx = await contract.fundAndLogWork(
        newJob.workerAddress,
        hash,
        newJob.jobDescription,
        newJob.workerName,
        "",
        { value: ethers.parseEther(newJob.amountMON) }
      );

      await tx.wait();
      setShowAddJob(false);
      await loadPendingReceipts(walletAddress);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pt-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🏗️</span>
          <div>
            <h1 className="text-2xl font-bold">Employer Dashboard</h1>
            <p className="text-gray-400 text-sm">Review & pay workers' receipts</p>
          </div>
        </div>

        {/* Connect wallet */}
        {!walletAddress ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-6">Connect your wallet to see pending receipts</p>
            <button
              onClick={connectWallet}
              className="px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold transition-all"
            >
              Connect Wallet (Monad Testnet)
            </button>
            <p className="text-gray-600 text-xs mt-4">
              Chain ID: 10143 · RPC: testnet-rpc.monad.xyz
            </p>
          </div>
        ) : (
          <>
            {/* Wallet info */}
            <div className="bg-gray-900 rounded-xl p-3 mb-6 border border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Connected</p>
                <p className="text-sm font-mono text-gray-300">
                  {walletAddress.substring(0, 8)}...{walletAddress.substring(36)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-400">Monad Testnet</span>
              </div>
            </div>

            {/* Add Job button */}
            <button
              onClick={() => setShowAddJob(!showAddJob)}
              className="w-full py-3 mb-4 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 border-dashed text-gray-300 transition-all text-sm"
            >
              + Add Job Manually (Demo)
            </button>

            {/* Manual job form */}
            {showAddJob && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-4">
                <h3 className="font-medium mb-3 text-sm text-gray-300">New Job Details</h3>
                <div className="space-y-3">
                  <input
                    placeholder="Worker wallet address (0x...)"
                    value={newJob.workerAddress}
                    onChange={(e) => setNewJob({ ...newJob, workerAddress: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 font-mono"
                  />
                  <input
                    placeholder="Worker name"
                    value={newJob.workerName}
                    onChange={(e) => setNewJob({ ...newJob, workerName: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                  />
                  <input
                    placeholder="Job description"
                    value={newJob.jobDescription}
                    onChange={(e) => setNewJob({ ...newJob, jobDescription: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      placeholder="Amount (MON)"
                      type="number"
                      step="0.01"
                      value={newJob.amountMON}
                      onChange={(e) => setNewJob({ ...newJob, amountMON: e.target.value })}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                    <span className="text-gray-500 text-sm">MON</span>
                  </div>
                </div>
                <button
                  onClick={addJobManually}
                  disabled={loading}
                  className="w-full mt-3 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Fund & Log Job"}
                </button>
              </div>
            )}

            {/* Pending receipts */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-200">Pending Approvals</h2>
                <button
                  onClick={() => loadPendingReceipts(walletAddress)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Refresh
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading receipts...</div>
              ) : receipts.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <p>No pending receipts</p>
                  <p className="text-xs mt-1">Workers log work from the Worker page</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receipts.map((r) => (
                    <div
                      key={r.receiptId}
                      className={`bg-gray-900 rounded-xl p-4 border transition-all ${
                        r.paid
                          ? "border-green-800/40 opacity-60"
                          : "border-gray-700"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-white">{r.workerName || "Worker"}</p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">
                            {r.workerAddress.substring(0, 10)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 font-semibold">{r.amount} MON</p>
                          <p className="text-xs text-gray-600">
                            {new Date(r.timestamp * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-gray-400 mb-3">{r.jobDescription}</p>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-xs font-mono text-gray-600 truncate">
                          {r.receiptHash.substring(0, 16)}...
                        </div>
                        <a
                          href={`https://testnet.monadscan.com`}
                          target="_blank"
                          className="text-xs text-violet-400 hover:text-violet-300"
                        >
                          Monadscan ↗
                        </a>
                      </div>

                      {r.paid ? (
                        <div className="mt-3 py-2 text-center text-green-400 text-sm font-medium">
                          ✅ Paid
                          {txHashes[r.receiptId] && (
                            <a
                              href={`https://testnet.monadscan.com/tx/${txHashes[r.receiptId]}`}
                              target="_blank"
                              className="ml-2 text-xs text-violet-400 underline"
                            >
                              View tx
                            </a>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => approveAndPay(r.receiptId)}
                          disabled={approving === r.receiptId}
                          className="w-full mt-3 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-all disabled:opacity-50 active:scale-95"
                        >
                          {approving === r.receiptId
                            ? "⏳ Releasing payment..."
                            : "✅ Approve & Pay Worker"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-700/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
