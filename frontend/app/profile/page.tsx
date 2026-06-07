"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "next/navigation";
import { GIGPROOF_ABI, GIGPROOF_ADDRESS } from "../../lib/contract";

interface ProfileData {
  totalJobs: number;
  totalEarned: string; // in MON
  reputation: number;
  receipts: ReceiptData[];
}

interface ReceiptData {
  id: number;
  jobDescription: string;
  amount: string;
  timestamp: number;
  paid: boolean;
  receiptHash: string;
}

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const walletParam = searchParams.get("wallet");

  const [address, setAddress] = useState(walletParam || "");
  const [inputAddress, setInputAddress] = useState(walletParam || "");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (walletParam) {
      loadProfile(walletParam);
    }
  }, [walletParam]);

  const loadProfile = async (addr: string) => {
    if (!ethers.isAddress(addr)) {
      setError("Invalid wallet address");
      return;
    }
    try {
      setLoading(true);
      setError("");

      const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
      const contract = new ethers.Contract(GIGPROOF_ADDRESS, GIGPROOF_ABI, provider);

      // Get profile
      const p = await contract.getWorkerProfile(addr);
      // Get all receipt IDs
      const ids = await contract.getWorkerReceiptIds(addr);

      // Fetch each receipt
      const receipts: ReceiptData[] = [];
      for (const id of ids) {
        const r = await contract.getReceipt(id);
        receipts.push({
          id: Number(id),
          jobDescription: r.jobDescription,
          amount: ethers.formatEther(r.amount),
          timestamp: Number(r.timestamp),
          paid: r.paid,
          receiptHash: r.receiptHash,
        });
      }

      setProfile({
        totalJobs: Number(p.totalJobs),
        totalEarned: ethers.formatEther(p.totalEarned),
        reputation: Number(p.reputation),
        receipts: receipts.sort((a, b) => b.timestamp - a.timestamp),
      });
      setAddress(addr);
    } catch (err: any) {
      setError("Failed to load profile: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const connectMyWallet = async () => {
    if (!(window as any).ethereum) { setError("No wallet found"); return; }
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setInputAddress(addr);
    await loadProfile(addr);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pt-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">👷</span>
          <div>
            <h1 className="text-2xl font-bold">Worker Profile</h1>
            <p className="text-gray-400 text-sm">On-chain work history · Financial identity</p>
          </div>
        </div>

        {/* Address input */}
        {!profile && (
          <div className="mb-6">
            <div className="flex gap-2 mb-3">
              <input
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                placeholder="Enter worker wallet address (0x...)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 font-mono"
              />
              <button
                onClick={() => loadProfile(inputAddress)}
                disabled={loading}
                className="px-4 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl transition-all disabled:opacity-50"
              >
                Load
              </button>
            </div>
            <button
              onClick={connectMyWallet}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-400 transition-all"
            >
              Or connect my wallet →
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-gray-500">
            Loading from Monad testnet...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-xl text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {profile && (
          <>
            {/* Wallet address */}
            <div className="bg-gray-900 rounded-xl p-3 mb-4 border border-gray-800 flex items-center justify-between">
              <p className="text-xs font-mono text-gray-400 truncate flex-1">
                {address}
              </p>
              <a
                href={`https://testnet.monadscan.com/address/${address}`}
                target="_blank"
                className="text-xs text-violet-400 ml-3 hover:text-violet-300 flex-shrink-0"
              >
                Monadscan ↗
              </a>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Jobs Done" value={profile.totalJobs.toString()} icon="✅" />
              <StatCard label="Earned (MON)" value={parseFloat(profile.totalEarned).toFixed(3)} icon="💰" />
              <StatCard
                label="Trust Score"
                value={`${profile.reputation}/100`}
                icon="⭐"
                highlight={profile.reputation > 50}
              />
            </div>

            {/* Trust score bar */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-400">On-chain Reputation</p>
                <p className="text-sm font-semibold text-violet-400">{profile.reputation}/100</p>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-green-500 rounded-full transition-all"
                  style={{ width: `${profile.reputation}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                +1 point per verified & paid job · Max 100
              </p>
            </div>

            {/* Share button */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Profile link copied! Share this to prove your work history.");
              }}
              className="w-full py-3 mb-6 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-600/40 rounded-xl text-violet-300 text-sm font-medium transition-all"
            >
              🔗 Copy Profile Link (Share for Loan / Next Job)
            </button>

            {/* Work history */}
            <div>
              <h2 className="font-semibold text-gray-200 mb-3">
                Work History ({profile.receipts.length} jobs)
              </h2>

              {profile.receipts.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  No work records yet
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.receipts.map((r) => (
                    <div
                      key={r.id}
                      className="bg-gray-900 rounded-xl p-4 border border-gray-800"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm text-white font-medium">{r.jobDescription}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                            r.paid
                              ? "bg-green-900/40 text-green-400 border border-green-800/40"
                              : "bg-yellow-900/40 text-yellow-400 border border-yellow-800/40"
                          }`}
                        >
                          {r.paid ? "Paid" : "Pending"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-green-400 font-medium">{r.amount} MON</span>
                        <span className="text-xs text-gray-600">
                          {new Date(r.timestamp * 1000).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Hash proof */}
                      <div className="mt-2 pt-2 border-t border-gray-800/50 flex items-center justify-between">
                        <p className="text-xs font-mono text-gray-600 truncate">
                          🔐 {r.receiptHash.substring(0, 18)}...
                        </p>
                        <a
                          href={`https://testnet.monadscan.com`}
                          target="_blank"
                          className="text-xs text-violet-400 hover:text-violet-300 ml-2 flex-shrink-0"
                        >
                          Verify ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reset / load another */}
            <button
              onClick={() => { setProfile(null); setAddress(""); setInputAddress(""); }}
              className="w-full mt-6 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-xl text-gray-400 text-sm transition-all"
            >
              Load Different Profile
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, highlight }: {
  label: string; value: string; icon: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 border text-center ${
      highlight
        ? "bg-violet-900/20 border-violet-700/40"
        : "bg-gray-900 border-gray-800"
    }`}>
      <div className="text-xl mb-1">{icon}</div>
      <div className={`text-lg font-bold ${highlight ? "text-violet-300" : "text-white"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
