🌍 Terra.Fi — LandFi Protocol on XRPL

Transforming Real Estate into Programmable Collateral
Built with XRPL Multi-Purpose Tokens (MPTs) and XLS-89 Metadata

🧭 1. Project Overview

Team: Dexcap Labs
Category: Real-World Asset Tokenization (RWA / LandFi)
Blockchain: XRP Ledger (XRPL Testnet)

🎯 Vision

Terra.Fi enables the tokenization and collateralization of real estate assets directly on the XRPL, turning land parcels into programmable, liquid financial instruments.

Through Multi-Purpose Tokens (MPTs), Terra.Fi introduces a new asset class — LandFi — where investors can tokenize, trade, and collateralize real-world land using native XRPL features like Authorize, Freeze, and Clawback.

🧩 2. The Problem
Challenge	Impact
Real estate is illiquid	Land transactions take months and require intermediaries
Developers lack early-stage financing	Capital access is slow and fragmented
Investors can’t access fractional ownership	High entry barriers
Collateralization is opaque	No transparent, programmable model for real-world assets

💡 3. The Solution

Terra.Fi bridges property developers, investors, and distributors in a single compliant infrastructure.
Using XRPL’s MPT standard, the platform allows:

Tokenization — LAND parcels converted into fungible digital tokens (LAND-MPT).

Fractional Ownership — investors purchase fractions via Crossmark Wallet using XRP or RLUSD.

Collateralization — LAND tokens are locked on-chain to issue COL-MPT, representing credit power.

Compliance — XRPL-native controls (RequireAuth, Freeze, Clawback) ensure KYC and legal integrity.

✅ Terra.Fi turns land into a financial asset class — transparent, liquid, and programmable.

🧠 4. Key Features
Feature	Description
🏠 LAND-MPT	Fractionalized representation of tokenized land parcels
🧱 BUILD-MPT	Construction phase financing (CAPEX tranches)
💵 REV-MPT	Revenue share / yield rights
🔒 COL-MPT	Collateral token backed by LAND-MPT (locked & frozen)
⚙️ XLS-89 Metadata	Land registry (geo, valuation, legal proof)
🪙 Crossmark Integration	Self-custody wallet for XRP and MPT transactions
🧩 Compliance Layer	RequireAuth, Freeze, Clawback implemented natively
🏗️ Collateral Engine	LAND → COL token issuance with haircut (e.g., 20%)

⚙️ 5. Architecture
Investor (Crossmark Wallet)
        ↓
  Terra.Fi Frontend (Next.js)
        ↓
 Terra.Fi API Gateway (NestJS)
        ↓
XRPL Testnet (MPT Issuance, Authorize, Freeze, Clawback)
        ↓
 PostgreSQL (off-chain metadata + audit trail)

🧱 6. Tokens Overview
Token	Purpose	Example	XRPL Features
LAND-MPT	Fractionalized land parcel	1 token = 1 m²	RequireAuth, Freeze, Clawback
BUILD-MPT	Construction phase tranche	CAPEX Phases	Freeze, Oracle integration
REV-MPT	Revenue distribution right	Rent / Sale Profit	Transferable, Clawback
COL-MPT	Collateral representation	Locked LAND = Credit	Non-transferable, Freeze

🚀 7. Setup & Execution
⚙️ Requirements

Node.js ≥ 20

pnpm or npm

XRPL Testnet account

Crossmark Wallet

🧩 Installation
git clone https://github.com/dexcap-labs/terrafi-xrpl.git
cd terrafi-xrpl
pnpm install
pnpm -w build

▶️ Run Backend (API Gateway)
cd apps/api
pnpm dev

🌐 Run Frontend (WebApp)
cd apps/web
pnpm dev

💾 Environment Variables

Create a .env file in /apps/api with:

XRPL_RPC_URL=https://s.altnet.rippletest.net:51234
XRPL_NETWORK=testnet
XRPL_ISSUER_SECRET=*
XRPL_ISSUER_ADDRESS=r******
DATABASE_URL=postgres://user:pass@localhost:5432/terrafi
CROSSMARK_APP_ID=terrafi-demo
COLLATERAL_HAIRCUT_BPS=2000

🎥 8. Demo Video

🎬 Watch the full 5-minute demo here:
👉 https://youtu.be/

The demo includes:

Tokenization of a land parcel (LAND-MPT)

Investor purchase via Crossmark Wallet

LAND freeze and COL token issuance

Collateral value displayed on dashboard

Real-time transaction logs on XRPL explorer

🌍 9. Public Access

Project URL:
🔗 https://terra-fi-y6jd.vercel.app/

Repository:
📦 https://github.com/dexcap-labs/terrafi-xrpl

📚 10. Technologies Used
Layer	Technology
Blockchain	XRPL Testnet + MPT (Multi-Purpose Tokens)
Wallet	Crossmark SDK
Backend	NestJS + xrpl.js + PostgreSQL
Frontend	Next.js + TailwindCSS
Metadata	XLS-89 Standard
Validation	Zod Schemas
Docs	Swagger / OpenAPI
Deployment	Docker Compose + Vercel
🧾 11. Documentation & Structure

Repository Structure

/apps
  /api → Backend (NestJS + Swagger)
  /web → Frontend (Next.js + Crossmark)
  /sdk-xrpl → XRPL helper library (MPT utils)
  /domain → Core logic (use cases)
  /types → Shared DTOs & schemas

🧠 12. Evaluation Alignment
Evaluation Criterion	Terra.Fi Response
Problem Resolution Potential	Addresses real-world liquidity gap in $350T real estate market using XRPL-native tokenization
Technical Viability	Implemented with MPT, XLS-89, Crossmark Wallet, and on-chain collateral logic
Adoption Leverage	Promotes institutional-grade RWA adoption via compliance & liquidity
Presentation Quality	Clear README, structured repo, 5-min demo video, and live testnet app

💼 13. Team
Name	Role	Background
André Mileto	Product & Architecture Lead	Dexcap — Infrastructure & Tokenization
Leandro Fernandes	XRPL Engineer	Backend, MPT issuance, Freeze/Clawback
Raphael Fogaça	Frontend Engineer	Next.js, Crossmark integration
