/**
 * GigProof Backend — Sarvam AI + Monad Agent Orchestrator
 *
 * ROUTES:
 *   POST /api/transcribe     — Sarvam STT: audio → transcript
 *   POST /api/extract-job    — Sarvam LLM: transcript → structured receipt JSON
 *   POST /api/tts            — Sarvam TTS: text → audio (confirmation voice)
 *   POST /api/hash-receipt   — SHA256 hash of receipt JSON (for on-chain storage)
 *   GET  /api/health         — health check
 *
 * The frontend calls these, then writes the hash to Monad directly from browser
 * using ethers.js + MetaMask/Privy wallet.
 */

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_BASE_URL = "https://api.sarvam.ai";

if (!SARVAM_API_KEY) {
  console.error("❌ SARVAM_API_KEY missing in .env");
  process.exit(1);
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "GigProof backend running 🚀" });
});

// ─── ROUTE 1: SPEECH TO TEXT ──────────────────────────────────────────────────
/**
 * POST /api/transcribe
 * Body: multipart/form-data with `audio` field (wav/mp3/webm)
 * Optional: `language` field (kn-IN, hi-IN, ta-IN, etc.)
 *
 * Returns: { transcript, language_code }
 *
 * Sarvam Saaras v3 supports 22 Indian languages + English
 */
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    console.log("🎤 Transcribing audio:", req.file.size, "bytes");

    // Prepare the form data for Sarvam
    const formData = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", audioBlob, "audio.wav");

    // Language: default Kannada, allow override from client
    const languageCode = req.body.language || "kn-IN";
    formData.append("language_code", languageCode);
    formData.append("model", "saaras:v3");
    // mode: "transcribe" keeps original language, "translate" converts to English
    formData.append("mode", "transcribe");

    const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sarvam STT error:", errorText);
      return res.status(500).json({ error: "Sarvam STT failed", details: errorText });
    }

    const data = await response.json();
    console.log("✅ Transcript:", data.transcript);

    res.json({
      transcript: data.transcript,
      language_code: languageCode,
    });
  } catch (error) {
    console.error("Transcribe error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── ROUTE 2: EXTRACT JOB DETAILS FROM TRANSCRIPT ─────────────────────────────
/**
 * POST /api/extract-job
 * Body: { transcript: string, language_code: string }
 *
 * Uses Sarvam 30B LLM to extract structured job details from spoken words.
 * Example: "I laid bricks at Whitefield site, should get 500 rupees"
 * → { workerName, jobDescription, amount, location, date }
 *
 * Returns: { receipt: ReceiptJSON, confidence: number }
 */
app.post("/api/extract-job", async (req, res) => {
  try {
    const { transcript, language_code } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "No transcript provided" });
    }

    console.log("🤖 Extracting job details from:", transcript);

    // Step 1: Translate to English if not already English
    let englishText = transcript;
    if (language_code && language_code !== "en-IN") {
      englishText = await translateToEnglish(transcript, language_code);
    }

    // Step 2: Use Sarvam 30B to extract structured data
    const systemPrompt = `You are a work receipt assistant for India's informal workers.
Extract job details from the worker's spoken statement.
Always respond with ONLY valid JSON, no markdown, no explanation.

JSON Schema:
{
  "workerName": "string or 'Unknown Worker'",
  "jobDescription": "string — what work was done",
  "amount": "number — payment amount in INR, 0 if not mentioned",
  "location": "string or 'Not specified'",
  "date": "string — today's date in YYYY-MM-DD format",
  "confidence": "number 0-1 — how confident you are in the extraction"
}`;

    const userMessage = `Worker said: "${englishText}"
Today's date: ${new Date().toISOString().split("T")[0]}
Extract the work receipt details.`;

    const llmResponse = await fetch(`${SARVAM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        //model: "sarvam-m",  // Sarvam 30B
        model: "sarvam-2b", // Sarvam 2B (faster, cheaper, still good for structured extraction)
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!llmResponse.ok) {
      const err = await llmResponse.text();
      console.error("Sarvam LLM error:", err);
      return res.status(500).json({ error: "LLM extraction failed", details: err });
    }

    const llmData = await llmResponse.json();
    const rawContent = llmData.choices[0].message.content;

    // Parse the JSON response
    let receipt;
    try {
      receipt = JSON.parse(rawContent);
    } catch {
      // Fallback: try to extract JSON from the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        receipt = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse LLM response as JSON");
      }
    }

    // Add metadata
    receipt.originalTranscript = transcript;
    receipt.englishTranscript = englishText;
    receipt.language = language_code;
    receipt.extractedAt = new Date().toISOString();

    console.log("✅ Extracted receipt:", receipt);

    res.json({ receipt });
  } catch (error) {
    console.error("Extract job error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── ROUTE 3: TEXT TO SPEECH (CONFIRMATION) ────────────────────────────────────
/**
 * POST /api/tts
 * Body: { text: string, language_code: string }
 *
 * Returns audio buffer — worker hears their receipt confirmed in their language
 * e.g., "Tumhara kaam darj ho gaya. ₹500 milenge jab employer approve kare."
 */
app.post("/api/tts", async (req, res) => {
  try {
    const { text, language_code } = req.body;

    if (!text) return res.status(400).json({ error: "No text provided" });

    console.log("🔊 Generating TTS for:", text.substring(0, 50));

    const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: language_code || "kn-IN",
        speaker: "meera",      // female voice, clear and natural
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 8000,
        enable_preprocessing: true,
        model: "bulbul:v1",    // Sarvam Bulbul v3
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "TTS failed", details: err });
    }

    const data = await response.json();

    // Sarvam returns base64-encoded audio
    res.json({ audio: data.audios[0] }); // base64 string
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── ROUTE 4: HASH RECEIPT ─────────────────────────────────────────────────────
/**
 * POST /api/hash-receipt
 * Body: { receipt: object }
 *
 * Returns SHA256 hash of canonical JSON — this goes on-chain
 * The hash is the tamper-proof fingerprint of the work receipt
 */
app.post("/api/hash-receipt", (req, res) => {
  try {
    const { receipt } = req.body;
    if (!receipt) return res.status(400).json({ error: "No receipt provided" });

    // Canonical JSON — deterministic serialization
    const canonicalJson = JSON.stringify({
      workerName: receipt.workerName,
      jobDescription: receipt.jobDescription,
      amount: receipt.amount,
      location: receipt.location,
      date: receipt.date,
      extractedAt: receipt.extractedAt,
    });

    const hash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
    const bytes32Hash = "0x" + hash; // Solidity bytes32 format

    console.log("🔐 Receipt hash:", bytes32Hash);

    res.json({
      hash: bytes32Hash,
      canonicalJson,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── HELPER: TRANSLATE TO ENGLISH ─────────────────────────────────────────────

async function translateToEnglish(text, sourceLanguage) {
  try {
    const response = await fetch(`${SARVAM_BASE_URL}/translate`, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLanguage,
        target_language_code: "en-IN",
        speaker_gender: "Male",
        mode: "formal",
        model: "mayura:v1",
        enable_preprocessing: false,
      }),
    });

    if (!response.ok) return text; // fallback to original

    const data = await response.json();
    return data.translated_text || text;
  } catch {
    return text; // fallback to original on error
  }
}

// ─── START SERVER ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 GigProof backend running on http://localhost:${PORT}`);
  console.log(`📋 Routes:`);
  console.log(`   POST /api/transcribe    — Sarvam STT`);
  console.log(`   POST /api/extract-job  — Sarvam LLM`);
  console.log(`   POST /api/tts          — Sarvam TTS`);
  console.log(`   POST /api/hash-receipt — SHA256 hash`);
  console.log(`   GET  /api/health       — health check`);
});

module.exports = app;
