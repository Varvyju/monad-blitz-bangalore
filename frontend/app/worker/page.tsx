"use client";

import { useState, useRef } from "react";
import { ethers } from "ethers";
import { GIGPROOF_ABI, GIGPROOF_ADDRESS, MONAD_TESTNET } from "../../lib/contract";

// Language options — Sarvam supports all of these
const LANGUAGES = [
  { code: "kn-IN", label: "ಕನ್ನಡ", english: "Kannada" },
  { code: "hi-IN", label: "हिंदी", english: "Hindi" },
  { code: "ta-IN", label: "தமிழ்", english: "Tamil" },
  { code: "te-IN", label: "తెలుగు", english: "Telugu" },
  { code: "ml-IN", label: "മലയാളം", english: "Malayalam" },
  { code: "mr-IN", label: "मराठी", english: "Marathi" },
  { code: "en-IN", label: "English", english: "English" },
];

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default function WorkerPage() {
  const [step, setStep] = useState<"idle" | "recording" | "processing" | "preview" | "submitting" | "done">("idle");
  const [language, setLanguage] = useState("kn-IN");
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptHash, setReceiptHash] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [confirmationAudio, setConfirmationAudio] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ─── STEP 1: RECORD VOICE ────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        stream.getTracks().forEach((t) => t.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setStep("recording");
    } catch (err) {
      setError("Microphone access denied. Please allow microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setStep("processing");
    }
  };

  // ─── STEP 2: PROCESS AUDIO (Sarvam STT + LLM + Hash) ────────────────────

  const processAudio = async (audioBlob: Blob) => {
    try {
      setStep("processing");

      // 2a. Sarvam STT — speech to text
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("language", language);

      const sttRes = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });
      const { transcript } = await sttRes.json();
      if (!transcript) throw new Error("Could not transcribe audio");

      // 2b. Sarvam LLM — extract structured receipt
      const extractRes = await fetch(`${BACKEND_URL}/api/extract-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, language_code: language }),
      });
      const { receipt: extractedReceipt } = await extractRes.json();
      if (!extractedReceipt) throw new Error("Could not extract job details");

      // 2c. Hash the receipt
      const hashRes = await fetch(`${BACKEND_URL}/api/hash-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: extractedReceipt }),
      });
      const { hash } = await hashRes.json();

      setReceipt(extractedReceipt);
      setReceiptHash(hash);
      setStep("preview");

      // 2d. Sarvam TTS — speak confirmation
      const confirmText = getConfirmationText(extractedReceipt, language);
      const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: confirmText, language_code: language }),
      });
      const { audio } = await ttsRes.json();
      if (audio) {
        setConfirmationAudio(audio);
        // Auto-play confirmation
        playAudio(audio);
      }
    } catch (err: any) {
      setError(err.message);
      setStep("idle");
    }
  };

  // ─── STEP 3: SUBMIT TO MONAD ──────────────────────────────────────────────

  const submitToMonad = async () => {
    try {
      setStep("submitting");
      setError("");

      // Check for MetaMask / injected wallet
      if (!window.ethereum) {
        throw new Error("No wallet found. Install MetaMask or use a wallet browser.");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      // Request wallet connection
      await provider.send("eth_requestAccounts", []);

      // Check we're on Monad testnet
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(10143)) {
        // Ask to switch
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x278F" }], // 10143 in hex
          });
        } catch {
          // Add network if not found
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x278F",
                chainName: "Monad Testnet",
                nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
                rpcUrls: ["https://testnet-rpc.monad.xyz"],
                blockExplorerUrls: ["https://testnet.monadscan.com"],
              },
            ],
          });
        }
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(GIGPROOF_ADDRESS, GIGPROOF_ABI, signer);

      // Convert amount from INR display to MON (for demo: 1 MON = ₹100)
      // In production: integrate actual exchange rate
      const amountInMON = receipt.amount > 0
        ? ethers.parseEther((receipt.amount / 100).toFixed(4))
        : ethers.parseEther("0.01"); // minimum 0.01 MON for demo

      // Write receipt hash to Monad
      // NOTE: Worker is signing from their own wallet here
      // In production, employer would call fundAndLogWork
      // For demo: worker logs work, employer address is a demo address
      const DEMO_EMPLOYER = signer.address; // for demo, same wallet acts as employer

      const tx = await contract.fundAndLogWork(
        signer.address,        // worker = current wallet
        receiptHash as `0x${string}`,
        receipt.jobDescription || "Work completed",
        receipt.workerName || "Worker",
        "",                    // no IPFS URI for demo
        { value: amountInMON }
      );

      console.log("⏳ Tx submitted:", tx.hash);
      const txReceipt = await tx.wait();

      setTxHash(tx.hash);
      setStep("done");

      // Speak success in local language
      const successText = getSuccessText(receipt, language);
      const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: successText, language_code: language }),
      });
      const { audio } = await ttsRes.json();
      if (audio) playAudio(audio);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transaction failed");
      setStep("preview");
    }
  };

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  const playAudio = (base64Audio: string) => {
    try {
      const audioData = atob(base64Audio);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      const blob = new Blob([audioArray], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (e) {
      console.log("Audio playback error:", e);
    }
  };

  const getConfirmationText = (receipt: any, lang: string) => {
    const confirmations: Record<string, string> = {
      "kn-IN": `ನಿಮ್ಮ ಕೆಲಸ ದಾಖಲಾಗಿದೆ. ${receipt.jobDescription}. ₹${receipt.amount} ದೊರೆಯಲಿದೆ.`,
      "hi-IN": `आपका काम दर्ज हो गया है। ${receipt.jobDescription}। ₹${receipt.amount} मिलेंगे।`,
      "ta-IN": `உங்கள் வேலை பதிவாகிவிட்டது. ${receipt.jobDescription}. ₹${receipt.amount} கிடைக்கும்.`,
      "en-IN": `Your work has been recorded. ${receipt.jobDescription}. ₹${receipt.amount} will be paid.`,
    };
    return confirmations[lang] || confirmations["en-IN"];
  };

  const getSuccessText = (receipt: any, lang: string) => {
    const messages: Record<string, string> = {
      "kn-IN": `ಪಾವತಿ ಯಶಸ್ವಿ. ₹${receipt.amount} ನಿಮ್ಮ ಖಾತೆಗೆ ಹೋಗಿದೆ. ರಸೀದಿ ಬ್ಲಾಕ್‌ಚೈನ್‌ನಲ್ಲಿ ಸಂರಕ್ಷಿಸಲಾಗಿದೆ.`,
      "hi-IN": `भुगतान सफल। ₹${receipt.amount} आपके खाते में आ गए। रसीद ब्लॉकचेन पर सुरक्षित है।`,
      "ta-IN": `பணம் வெற்றிகரமாக வந்தது. ₹${receipt.amount} உங்கள் கணக்கில் பெற்றீர்கள்.`,
      "en-IN": `Payment successful. ₹${receipt.amount} sent to your account. Receipt saved on blockchain forever.`,
    };
    return messages[lang] || messages["en-IN"];
  };

  const reset = () => {
    setStep("idle");
    setReceipt(null);
    setReceiptHash("");
    setTxHash("");
    setError("");
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 pt-8">
      {/* Header */}
      <div className="w-full max-w-md mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🧱</span>
          <div>
            <h1 className="text-2xl font-bold text-white">GigProof</h1>
            <p className="text-gray-400 text-sm">Voice → Blockchain Receipt in 10 seconds</p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex gap-2 mt-4">
          {["Voice", "Review", "On-Chain", "Done"].map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full ${
              (step === "idle" && i === 0) ||
              (step === "recording" && i === 0) ||
              (step === "processing" && i <= 1) ||
              (step === "preview" && i <= 1) ||
              (step === "submitting" && i <= 2) ||
              (step === "done" && i <= 3)
                ? "bg-violet-500"
                : "bg-gray-800"
            }`} />
          ))}
        </div>
      </div>

      {/* Language Selector */}
      {step === "idle" && (
        <div className="w-full max-w-md mb-6">
          <label className="text-sm text-gray-400 mb-2 block">Select your language</label>
          <div className="grid grid-cols-4 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`p-2 rounded-lg text-center border transition-all ${
                  language === lang.code
                    ? "border-violet-500 bg-violet-900/30 text-violet-300"
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
                }`}
              >
                <div className="text-lg">{lang.label}</div>
                <div className="text-xs mt-0.5 text-gray-500">{lang.english}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="w-full max-w-md">

        {/* IDLE — big mic button */}
        {step === "idle" && (
          <div className="text-center">
            <p className="text-gray-400 mb-8 text-sm leading-relaxed">
              Speak your work details.<br />
              "I laid bricks at Whitefield, ₹500 for today"
            </p>
            <button
              onClick={startRecording}
              className="w-40 h-40 rounded-full bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all mx-auto flex items-center justify-center shadow-lg shadow-violet-900/50"
            >
              <span className="text-6xl">🎙️</span>
            </button>
            <p className="mt-6 text-gray-500 text-sm">Tap to speak</p>
          </div>
        )}

        {/* RECORDING */}
        {step === "recording" && (
          <div className="text-center">
            <div className="w-40 h-40 rounded-full bg-red-600 mx-auto flex items-center justify-center animate-pulse shadow-lg shadow-red-900/50">
              <span className="text-6xl">🔴</span>
            </div>
            <p className="mt-4 text-red-400 font-medium">Recording... speak now</p>
            <button
              onClick={stopRecording}
              className="mt-8 px-8 py-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-all"
            >
              Stop Recording
            </button>
          </div>
        )}

        {/* PROCESSING */}
        {step === "processing" && (
          <div className="text-center">
            <div className="w-40 h-40 rounded-full bg-gray-800 mx-auto flex items-center justify-center">
              <span className="text-5xl animate-spin">⚙️</span>
            </div>
            <p className="mt-4 text-gray-300">Processing with Sarvam AI...</p>
            <p className="mt-2 text-gray-500 text-sm">Converting speech → receipt</p>
          </div>
        )}

        {/* PREVIEW — show extracted receipt */}
        {step === "preview" && receipt && (
          <div>
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-700 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Work Receipt</h2>
                <span className="text-xs bg-violet-900/40 text-violet-300 px-2 py-1 rounded-full border border-violet-700/50">
                  AI Extracted
                </span>
              </div>

              <div className="space-y-3">
                <Row label="Worker" value={receipt.workerName || "—"} />
                <Row label="Job" value={receipt.jobDescription || "—"} />
                <Row label="Amount" value={receipt.amount > 0 ? `₹${receipt.amount}` : "Not specified"} highlight />
                <Row label="Location" value={receipt.location || "—"} />
                <Row label="Date" value={receipt.date || new Date().toLocaleDateString()} />
              </div>

              {receiptHash && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">Receipt Hash (stored on Monad)</p>
                  <p className="text-xs font-mono text-gray-400 break-all">
                    {receiptHash.substring(0, 20)}...{receiptHash.substring(receiptHash.length - 10)}
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <button
              onClick={submitToMonad}
              className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold text-lg transition-all active:scale-95 shadow-lg shadow-violet-900/40"
            >
              ⛓️ Save to Monad Blockchain
            </button>
            <button
              onClick={reset}
              className="w-full mt-3 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 transition-all"
            >
              Record Again
            </button>
          </div>
        )}

        {/* SUBMITTING */}
        {step === "submitting" && (
          <div className="text-center">
            <div className="w-40 h-40 rounded-full bg-violet-900/30 border-2 border-violet-500 mx-auto flex items-center justify-center">
              <span className="text-5xl animate-bounce">⛓️</span>
            </div>
            <p className="mt-4 text-violet-300 font-medium">Writing to Monad...</p>
            <p className="mt-2 text-gray-500 text-sm">0.4 second block time ⚡</p>
          </div>
        )}

        {/* DONE — success! */}
        {step === "done" && (
          <div>
            <div className="text-center mb-6">
              <div className="w-24 h-24 rounded-full bg-green-900/30 border-2 border-green-500 mx-auto flex items-center justify-center mb-4">
                <span className="text-4xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-green-400">Receipt Saved!</h2>
              <p className="text-gray-400 mt-2 text-sm">
                Your work is permanently recorded on Monad blockchain.
                <br />No one can ever deny you worked today.
              </p>
            </div>

            {txHash && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-4">
                <p className="text-xs text-gray-500 mb-2">Transaction on Monad</p>
                <a
                  href={`https://testnet.monadscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-violet-400 break-all hover:text-violet-300 underline"
                >
                  {txHash}
                </a>
                <p className="text-xs text-gray-600 mt-2">
                  ↗ Click to verify on Monadscan
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = `/profile?wallet=${window.ethereum?.selectedAddress}`}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-all"
              >
                View My Profile
              </button>
              <button
                onClick={reset}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 transition-all"
              >
                Log Another Job
              </button>
            </div>
          </div>
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

// Small helper component
function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${highlight ? "text-green-400 font-semibold text-base" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
