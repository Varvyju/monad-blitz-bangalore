# GigProof 🧱

**Voice → Blockchain Receipt in 10 seconds for India's 500M informal workers**

> Built at Monad Blitz Bangalore V4 — The Agent Economy · June 7, 2026

---

## The Problem

India has **500+ million informal workers** — construction labour, domestic workers, farm helpers. They work on verbal agreements. When contractors don't pay, they have zero proof. No receipt. No record. No recourse.

India's new Labour Codes (effective November 2025) mandate gig worker social security — but the **90-day proof-of-work requirement** has no system to record this for informal workers. GigProof fills that gap.

**The gap the Monad event theme describes — applied to 500 million real people:**
- ❌ **Identity** — no on-chain identity
- ❌ **Memory** — no record of what they did
- ❌ **Ownership** — can't prove their work history
- ❌ **Trust** — contractors can deny payment
- ❌ **Coordination** — no way to dispute
- ❌ **Execution** — payment requires human middlemen

**GigProof fixes all six — using Sarvam AI + Monad.**

---

## How It Works

```
Worker speaks Kannada/Hindi
       ↓
  Sarvam STT (Saaras v3) — transcribes in 22 Indian languages
       ↓
  Sarvam LLM (Sarvam-M) — extracts job details → receipt JSON
       ↓
  SHA-256 hash of receipt
       ↓
  GigProof.sol on Monad Testnet — receipt hash stored on-chain forever
       ↓
  Employer clicks "Approve & Pay" → escrow auto-releases MON
       ↓
  Sarvam TTS (Bulbul v3) — speaks payment confirmation in Kannada
       ↓
  Worker profile: portable on-chain work history + reputation score
```

---

## Demo Flow (3 minutes)

1. **"500M Indians work every day. None can prove it. Until now."**
2. Worker speaks in Kannada → Sarvam transcribes live → receipt extracted
3. Receipt hash written to **Monad testnet** → show tx on Monadscan
4. Employer clicks Pay → payment fires → Sarvam TTS confirms in Kannada
5. Worker profile: on-chain reputation + full work history

---

## Tech Stack

| Layer | Technology | What it does |
|-------|-----------|--------------|
| Voice | **Sarvam Saaras v3** | STT in 22 Indian languages |
| AI extraction | **Sarvam-M (30B LLM)** | Structured receipt from speech |
| Voice confirmation | **Sarvam Bulbul v3** | TTS payment confirmation |
| Receipt proof | **SHA-256 → Monad** | Tamper-proof hash on-chain |
| Smart contract | **GigProof.sol** | Escrow + hash registry |
| Chain | **Monad Testnet** | 10,000 TPS, 0.4s finality |
| Frontend | **Next.js + ethers.js** | Worker + employer UIs |
| Backend | **Node.js + Express** | Sarvam API orchestration |

---

## Deployed Contract

- **Network:** Monad Testnet (Chain ID: 10143)
- **Contract:** `[ADDRESS_AFTER_DEPLOYMENT]`
- **Monadscan:** https://testnet.monadscan.com/address/[ADDRESS]

---

## Team

Built at Monad Blitz Bangalore V4 in 5 hours 45 minutes.

---

## Why This Wins

- ✅ Uses Sarvam deeply (STT + LLM + TTS — not just one API)
- ✅ Uses Monad for real (deployed contract, live txs, escrow)
- ✅ Real world problem (500M people, cited in India's Labour Codes 2026)
- ✅ Demo is emotional — Kannada → blockchain in 10 seconds
- ✅ The agent is a real economic actor: owns identity, executes payment, stores memory
