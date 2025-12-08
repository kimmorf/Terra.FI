# 🌍 Terra.Fi — LandFi Protocol on XRPL

> **Transforming Real Estate into Programmable Collateral**  
> Built with XRPL Multi-Purpose Tokens (MPTs) and XLS-89 Metadata

---

## 🧭 1. Project Overview

| | |
|---|---|
| **Team** | Dexcap Labs |
| **Category** | Real-World Asset Tokenization (RWA / LandFi) |
| **Blockchain** | XRP Ledger (XRPL DevNet) |
| **Stack** | Next.js 14 + Prisma + PostgreSQL + xrpl.js |

### 🎯 Vision

Terra.Fi enables the **tokenization and collateralization** of real estate assets directly on the XRPL, turning land parcels into programmable, liquid financial instruments.

Through **Multi-Purpose Tokens (MPTs)**, Terra.Fi introduces a new asset class — **LandFi** — where investors can tokenize, trade, and collateralize real-world land using native XRPL features like **Authorize**, **Freeze**, and **Clawback**.

---

## 🧩 2. The Problem

| Challenge | Impact |
|-----------|--------|
| Real estate is illiquid | Land transactions take months and require intermediaries |
| Developers lack early-stage financing | Capital access is slow and fragmented |
| Investors can't access fractional ownership | High entry barriers |
| Collateralization is opaque | No transparent, programmable model for real-world assets |

---

## 💡 3. The Solution

Terra.Fi bridges property developers, investors, and distributors in a single compliant infrastructure.

Using XRPL's **MPT standard**, the platform allows:

- ✅ **Tokenization** — LAND parcels converted into fungible digital tokens (LAND-MPT)
- ✅ **Fractional Ownership** — investors purchase fractions via Crossmark Wallet using XRP or RLUSD
- ✅ **Collateralization** — LAND tokens are locked on-chain to issue COL-MPT, representing credit power
- ✅ **Compliance** — XRPL-native controls (RequireAuth, Freeze, Clawback) ensure KYC and legal integrity

> **✅ Terra.Fi turns land into a financial asset class — transparent, liquid, and programmable.**

---

## 🧠 4. Key Features

### 🎛️ Platform Features

| Feature | Description |
|---------|-------------|
| 🏠 **LAND-MPT** | Fractionalized representation of tokenized land parcels |
| 🧱 **BUILD-MPT** | Construction phase financing (CAPEX tranches) |
| 💵 **REV-MPT** | Revenue share / yield rights |
| 🔒 **COL-MPT** | Collateral token backed by LAND-MPT (locked & frozen) |
| ⚙️ **XLS-89 Metadata** | Land registry (geo, valuation, legal proof) |
| 🪙 **Crossmark Integration** | Self-custody wallet for XRP and MPT transactions |
| 🧩 **Compliance Layer** | RequireAuth, Freeze, Clawback implemented natively |
| 🏗️ **Collateral Engine** | LAND → COL token issuance with haircut (e.g., 20%) |

### 🖥️ Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| **Home / Dashboard** | `/` | Main dashboard with investor/admin views, projects, and MPTs |
| **Admin - MPT Management** | `/admin/mpt` | Emit, transfer, and list Multi-Purpose Tokens |
| **Admin - Wallets** | `/admin/wallets` | Create, fund, and manage protocol wallets |
| **Create Tokens** | `/tokens/create` | Create new MPT tokens with presets (LAND, BUILD, REV, COL) |
| **Token Trading (DEX)** | `/tokens/trade` | Trading desk with order book and offers |
| **Manage Tokens** | `/tokens/manage` | Authorize, freeze, clawback, and send tokens |
| **Revenue Distribution** | `/revenue` | Distribute revenues to token holders |
| **Investor Dashboard** | `/dashboard` | View investments and portfolio |
| **Test MPT** | `/test-mpt` | Test page for MPT creation flow |
| **Auth (Sign In/Up)** | `/auth/signin`, `/auth/signup` | Authentication pages |

### 🔌 API Endpoints

#### 🪙 MPT (Multi-Purpose Tokens)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mpt/create` | POST | Create new MPT issuance on XRPL |
| `/api/mpt/issue` | POST | Issue/mint tokens to distribution wallet |
| `/api/mpt/send` | POST | Send MPT tokens to holders |
| `/api/mpt/authorize` | POST | Authorize wallet to hold MPT |
| `/api/mpt/freeze` | POST | Freeze MPT for a specific holder |
| `/api/mpt/clawback` | POST | Clawback tokens from holder |
| `/api/mpt/list` | GET | List MPT issuances from XRPL |
| `/api/mpt/info` | GET | Get MPT info from ledger |
| `/api/mpt/issuances` | GET | List all issuances from database |
| `/api/mpt/issuances/[id]` | GET | Get specific issuance details |
| `/api/mpt/issuances/[id]/authorize-wallet` | POST | Authorize wallet for issuance |
| `/api/mpt/issuances/[id]/mint-to-distribution` | POST | Mint tokens to distribution wallet |

#### 👛 Wallets
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/wallets` | GET | List all service wallets |
| `/api/admin/wallets` | POST | Create new wallet (auto-fund on DevNet) |
| `/api/admin/wallets/[id]` | POST | Fund existing wallet via faucet |
| `/api/admin/wallets/[id]` | DELETE | Delete wallet |
| `/api/admin/wallets/select` | POST | Select active wallet |

#### 💼 Investments & Projects
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/projects` | GET/POST | Manage projects |
| `/api/investments` | GET/POST | Manage investments |
| `/api/investments/my-investments` | GET | Get user investments |
| `/api/purchase/quote` | POST | Get purchase quote |
| `/api/purchase/commit` | POST | Commit to purchase |
| `/api/purchase/confirm` | POST | Confirm purchase |

#### 🔗 XRPL Direct
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/xrpl/autofill` | POST | Autofill transaction |
| `/api/xrpl/payment` | POST | Submit payment |
| `/api/xrpl/trustline` | POST | Create trustline |

---

## ⚙️ 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Investor / Admin                          │
│              (Crossmark Wallet / Browser)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Terra.Fi Frontend (Next.js 14)                  │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────┐   │
│  │  Dashboard  │ │ Token Pages  │ │  Admin Management   │   │
│  │   + Home    │ │ create/trade │ │   wallets/mpt       │   │
│  └─────────────┘ └──────────────┘ └─────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Terra.Fi API Routes (Next.js)                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐    │
│  │   MPT   │ │ Wallets │ │ XRPL    │ │  Investments    │    │
│  │ Service │ │ Service │ │ Direct  │ │    Service      │    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────────────┐
│   PostgreSQL (Prisma) │   │      XRPL DevNet              │
│  ┌─────────────────┐  │   │  ┌─────────────────────────┐  │
│  │ ServiceWallet   │  │   │  │ MPTokenIssuanceCreate   │  │
│  │ MPTIssuance     │  │   │  │ MPTokenAuthorize        │  │
│  │ Project         │  │   │  │ MPTokenIssuanceSet      │  │
│  │ Investment      │  │   │  │ Payment (MPT Transfer)  │  │
│  │ User            │  │   │  │ Clawback / Freeze       │  │
│  └─────────────────┘  │   │  └─────────────────────────┘  │
└───────────────────────┘   └───────────────────────────────┘
```

---

## 🧱 6. Tokens Overview

| Token | Purpose | Example | XRPL Features |
|-------|---------|---------|---------------|
| **LAND-MPT** | Fractionalized land parcel | 1 token = 1 m² | RequireAuth, Freeze, Clawback |
| **BUILD-MPT** | Construction phase tranche | CAPEX Phases | Freeze, Oracle integration |
| **REV-MPT** | Revenue distribution right | Rent / Sale Profit | Transferable, Clawback |
| **COL-MPT** | Collateral representation | Locked LAND = Credit | Non-transferable, Freeze |

---

## 🚀 7. Setup & Execution

### ⚙️ Requirements

- Node.js ≥ 20
- npm or pnpm
- PostgreSQL database
- Crossmark Wallet (browser extension)

### 🧩 Installation

```bash
git clone https://github.com/dexcap-labs/terrafi-xrpl.git
cd terrafi-xrpl
npm install
```

### 💾 Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/terrafi

# XRPL
XRPL_NETWORK=devnet
XRPL_DEVNET_URL=wss://s.devnet.rippletest.net:51233

# Encryption
WALLET_ENCRYPTION_KEY=your-32-char-encryption-key-here

# Better Auth
BETTER_AUTH_SECRET=your-auth-secret-here
BETTER_AUTH_URL=http://localhost:3000

# Optional
COLLATERAL_HAIRCUT_BPS=2000
```

### 🗄️ Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Open Prisma Studio
npx prisma studio
```

### ▶️ Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 🏗️ Build for Production

```bash
npm run build
npm start
```

---

## 📂 8. Project Structure

```
/
├── app/                          # Next.js 14 App Router
│   ├── page.tsx                  # Home / Main Dashboard
│   ├── layout.tsx                # Root layout with providers
│   ├── providers.tsx             # Theme + Crossmark providers
│   ├── admin/
│   │   ├── mpt/page.tsx          # MPT Management (emit/transfer/list)
│   │   └── wallets/page.tsx      # Wallet Management
│   ├── api/                      # API Routes
│   │   ├── mpt/                  # MPT endpoints
│   │   ├── admin/                # Admin endpoints
│   │   ├── xrpl/                 # Direct XRPL operations
│   │   ├── purchase/             # Purchase flow
│   │   └── investments/          # Investment management
│   ├── auth/                     # Authentication pages
│   ├── dashboard/                # Investor dashboard
│   ├── revenue/                  # Revenue distribution
│   ├── tokens/
│   │   ├── create/               # Create new tokens
│   │   ├── trade/                # DEX / Trading desk
│   │   └── manage/               # Token management
│   └── test-mpt/                 # Test page
│
├── components/                   # Reusable UI components
│   ├── WalletSelector.tsx        # Global wallet selector popup
│   ├── ThemeToggle.tsx           # Dark/Light mode toggle
│   ├── BackgroundParticles.tsx   # Animated background
│   ├── InvestmentCard.tsx        # Investment display card
│   └── TerraFiLogo.tsx           # Logo component
│
├── lib/                          # Core libraries
│   ├── crossmark/                # Crossmark wallet integration
│   │   ├── CrossmarkProvider.tsx # Context provider
│   │   ├── useCrossmark.ts       # React hook
│   │   ├── transactions.ts       # Transaction builders
│   │   └── sdk.ts                # SDK wrapper
│   ├── xrpl/                     # XRPL utilities
│   │   ├── pool.ts               # Connection pool
│   │   ├── mpt.ts                # MPT operations
│   │   ├── dex.ts                # DEX operations
│   │   ├── account.ts            # Account utilities
│   │   └── simple-client.ts      # Simple client for testing
│   ├── mpt/                      # MPT services
│   │   ├── mpt.service.ts        # Business logic
│   │   ├── api.ts                # API client
│   │   └── hooks/                # React hooks
│   ├── purchase/                 # Purchase flow
│   ├── tokens/                   # Token presets & stablecoins
│   ├── utils/                    # Utility functions
│   ├── auth.ts                   # Better Auth setup
│   └── prisma.ts                 # Database client
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Database migrations
│
├── docs/                         # Documentation
│   ├── MPT_IMPLEMENTATION_ANALYSIS.md
│   ├── MPT_USAGE_GUIDE.md
│   ├── WEB3_INTEGRATION_GUIDE.md
│   └── errors/                   # Error documentation
│
└── tests/                        # Test suites
    ├── e2e/                      # End-to-end tests
    └── compliance/               # Compliance tests
```

---

## 🎥 9. Demo Video

🎬 **Watch the full 5-minute demo here:**  
👉 [https://youtu.be/](https://youtu.be/)

The demo includes:
- ✅ Tokenization of a land parcel (LAND-MPT)
- ✅ Investor purchase via Crossmark Wallet
- ✅ LAND freeze and COL token issuance
- ✅ Collateral value displayed on dashboard
- ✅ Real-time transaction logs on XRPL explorer

---

## 🌍 10. Public Access

| | |
|---|---|
| **Project URL** | 🔗 [https://terra-fi-y6jd.vercel.app/](https://terra-fi-y6jd.vercel.app/) |
| **Repository** | 📦 [https://github.com/dexcap-labs/terrafi-xrpl](https://github.com/dexcap-labs/terrafi-xrpl) |
| **XRPL Explorer** | 🔍 [https://devnet.xrpl.org](https://devnet.xrpl.org) |

---

## 📚 11. Technologies Used

| Layer | Technology |
|-------|------------|
| **Blockchain** | XRPL DevNet + MPT (Multi-Purpose Tokens) |
| **Wallet** | Crossmark SDK |
| **Backend** | Next.js 14 API Routes + xrpl.js |
| **Database** | PostgreSQL + Prisma ORM |
| **Frontend** | Next.js 14 + TailwindCSS + Framer Motion |
| **Auth** | Better Auth |
| **Metadata** | XLS-89 Standard |
| **Deployment** | Vercel |

---

## 🧠 12. Evaluation Alignment

| Evaluation Criterion | Terra.Fi Response |
|---------------------|-------------------|
| **Problem Resolution Potential** | Addresses real-world liquidity gap in $350T real estate market using XRPL-native tokenization |
| **Technical Viability** | Implemented with MPT, XLS-89, Crossmark Wallet, and on-chain collateral logic |
| **Adoption Leverage** | Promotes institutional-grade RWA adoption via compliance & liquidity |
| **Presentation Quality** | Clear README, structured repo, 5-min demo video, and live testnet app |

---

## 💼 13. Team

| Name | Role | Background |
|------|------|------------|
| **André Mileto** | Product & Architecture Lead | Dexcap — Infrastructure & Tokenization |
| **Leandro Fernandes** | XRPL Engineer | Backend, MPT issuance, Freeze/Clawback |
| **Raphael Fogaça** | Frontend Engineer | Next.js, Crossmark integration |

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for the XRPL Hackathon**

🌍 Terra.Fi — *Making Land Liquid*

</div>
