# Terra.Fi — LandFi Protocol on XRPL

**Transforming Real Estate into Programmable Collateral**  
Built with XRPL Multi-Purpose Tokens (MPTs) and XLS-89 Metadata

---

## 1. Project Overview

| | |
|---|---|
| **Team** | Dexcap Labs |
| **Category** | Real-World Asset Tokenization (RWA / LandFi) |
| **Blockchain** | XRP Ledger (XRPL DevNet) |
| **Stack** | Next.js 14, Prisma, PostgreSQL, xrpl.js |

### Vision

Terra.Fi enables the tokenization and collateralization of real estate assets directly on the XRPL, turning land parcels into programmable, liquid financial instruments.

Through Multi-Purpose Tokens (MPTs), Terra.Fi introduces a new asset class — LandFi — where investors can tokenize, trade, and collateralize real-world land using native XRPL features like Authorize, Freeze, and Clawback.

---

## 2. The Problem

| Challenge | Impact |
|-----------|--------|
| Real estate is illiquid | Land transactions take months and require intermediaries |
| Developers lack early-stage financing | Capital access is slow and fragmented |
| Investors can't access fractional ownership | High entry barriers |
| Collateralization is opaque | No transparent, programmable model for real-world assets |

---

## 3. The Solution

Terra.Fi bridges property developers, investors, and distributors in a single compliant infrastructure.

Using XRPL's MPT standard, the platform allows:

- **Tokenization** — LAND parcels converted into fungible digital tokens (LAND-MPT)
- **Fractional Ownership** — Investors purchase fractions via Crossmark Wallet using XRP or RLUSD
- **Collateralization** — LAND tokens are locked on-chain to issue COL-MPT, representing credit power
- **Compliance** — XRPL-native controls (RequireAuth, Freeze, Clawback) ensure KYC and legal integrity

> Terra.Fi turns land into a financial asset class — transparent, liquid, and programmable.

---

## 4. Key Features

### Platform Capabilities

| Feature | Description |
|---------|-------------|
| LAND-MPT | Fractionalized representation of tokenized land parcels |
| BUILD-MPT | Construction phase financing (CAPEX tranches) |
| REV-MPT | Revenue share and yield rights |
| COL-MPT | Collateral token backed by LAND-MPT (locked and frozen) |
| XLS-89 Metadata | Land registry including geo-location, valuation, and legal proof |
| Crossmark Integration | Self-custody wallet for XRP and MPT transactions |
| Compliance Layer | RequireAuth, Freeze, Clawback implemented natively |
| Collateral Engine | LAND to COL token issuance with configurable haircut |

### Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Home / Dashboard | `/` | Main dashboard with investor and admin views |
| Admin - MPT Management | `/admin/mpt` | Emit, transfer, and list Multi-Purpose Tokens |
| Admin - Wallets | `/admin/wallets` | Create, fund, and manage protocol wallets |
| Create Tokens | `/tokens/create` | Create new MPT tokens with presets |
| Token Trading (DEX) | `/tokens/trade` | Trading desk with order book and offers |
| Manage Tokens | `/tokens/manage` | Authorize, freeze, clawback, and send tokens |
| Revenue Distribution | `/revenue` | Distribute revenues to token holders |
| Investor Dashboard | `/dashboard` | View investments and portfolio |
| Authentication | `/auth/signin`, `/auth/signup` | User authentication |

### API Endpoints

#### MPT (Multi-Purpose Tokens)

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

#### Wallets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/wallets` | GET | List all service wallets |
| `/api/admin/wallets` | POST | Create new wallet with auto-funding |
| `/api/admin/wallets/[id]` | POST | Fund existing wallet via faucet |
| `/api/admin/wallets/[id]` | DELETE | Delete wallet |
| `/api/admin/wallets/select` | POST | Select active wallet |

#### Investments and Projects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/projects` | GET/POST | Manage projects |
| `/api/investments` | GET/POST | Manage investments |
| `/api/investments/my-investments` | GET | Get user investments |
| `/api/purchase/quote` | POST | Get purchase quote |
| `/api/purchase/commit` | POST | Commit to purchase |
| `/api/purchase/confirm` | POST | Confirm purchase |

#### XRPL Direct Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/xrpl/autofill` | POST | Autofill transaction |
| `/api/xrpl/payment` | POST | Submit payment |
| `/api/xrpl/trustline` | POST | Create trustline |

---

## 5. Architecture

```
                         Investor / Admin
                    (Crossmark Wallet / Browser)
                               |
                               v
              +--------------------------------+
              |   Terra.Fi Frontend (Next.js)  |
              |  Dashboard | Tokens | Admin    |
              +--------------------------------+
                               |
                               v
              +--------------------------------+
              |   Terra.Fi API Routes          |
              |  MPT | Wallets | Investments   |
              +--------------------------------+
                               |
              +----------------+----------------+
              |                                |
              v                                v
    +------------------+          +------------------------+
    | PostgreSQL       |          | XRPL DevNet            |
    | (Prisma ORM)     |          | MPTokenIssuanceCreate  |
    |                  |          | MPTokenAuthorize       |
    | - ServiceWallet  |          | MPTokenIssuanceSet     |
    | - MPTIssuance    |          | Payment (MPT Transfer) |
    | - Project        |          | Clawback / Freeze      |
    | - Investment     |          |                        |
    +------------------+          +------------------------+
```

---

## 6. Token Types

| Token | Purpose | Example | XRPL Features |
|-------|---------|---------|---------------|
| LAND-MPT | Fractionalized land parcel | 1 token = 1 m² | RequireAuth, Freeze, Clawback |
| BUILD-MPT | Construction phase tranche | CAPEX Phases | Freeze, Oracle integration |
| REV-MPT | Revenue distribution right | Rent / Sale Profit | Transferable, Clawback |
| COL-MPT | Collateral representation | Locked LAND = Credit | Non-transferable, Freeze |

---

## 7. Setup and Installation

### Requirements

- Node.js 20 or higher
- npm or pnpm
- PostgreSQL database
- Crossmark Wallet browser extension

### Installation

```bash
git clone https://github.com/dexcap-labs/terrafi-xrpl.git
cd terrafi-xrpl
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/terrafi

# XRPL
XRPL_NETWORK=devnet
XRPL_DEVNET_URL=wss://s.devnet.rippletest.net:51233

# Encryption
WALLET_ENCRYPTION_KEY=your-32-character-encryption-key

# Authentication
BETTER_AUTH_SECRET=your-auth-secret
BETTER_AUTH_URL=http://localhost:3000

# Optional
COLLATERAL_HAIRCUT_BPS=2000
```

### Database Setup

```bash
npx prisma generate
npx prisma db push
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

---

## 8. Project Structure

```
/
├── app/                          # Next.js 14 App Router
│   ├── page.tsx                  # Home Dashboard
│   ├── layout.tsx                # Root layout
│   ├── admin/
│   │   ├── mpt/                  # MPT Management
│   │   └── wallets/              # Wallet Management
│   ├── api/                      # API Routes
│   │   ├── mpt/                  # MPT endpoints
│   │   ├── admin/                # Admin endpoints
│   │   ├── xrpl/                 # XRPL operations
│   │   └── investments/          # Investment endpoints
│   ├── tokens/
│   │   ├── create/               # Token creation
│   │   ├── trade/                # DEX trading
│   │   └── manage/               # Token management
│   └── revenue/                  # Revenue distribution
│
├── components/                   # UI Components
│   ├── WalletSelector.tsx        # Wallet selection modal
│   ├── ThemeToggle.tsx           # Theme switcher
│   └── BackgroundParticles.tsx   # Visual effects
│
├── lib/                          # Core Libraries
│   ├── crossmark/                # Crossmark integration
│   ├── xrpl/                     # XRPL utilities
│   ├── mpt/                      # MPT services
│   ├── purchase/                 # Purchase flow
│   └── utils/                    # Utilities
│
├── prisma/
│   └── schema.prisma             # Database schema
│
└── docs/                         # Documentation
```

---

## 9. Demo

**Demo Video:** [https://youtu.be/](https://youtu.be/)

The demonstration covers:
- Tokenization of a land parcel (LAND-MPT)
- Investor purchase via Crossmark Wallet
- LAND freeze and COL token issuance
- Collateral value displayed on dashboard
- Real-time transaction logs on XRPL explorer

---

## 10. Deployment

| Resource | URL |
|----------|-----|
| Live Application | [https://terra-fi-y6jd.vercel.app/](https://terra-fi-y6jd.vercel.app/) |
| Repository | [https://github.com/dexcap-labs/terrafi-xrpl](https://github.com/dexcap-labs/terrafi-xrpl) |
| XRPL Explorer | [https://devnet.xrpl.org](https://devnet.xrpl.org) |

---

## 11. Technology Stack

| Layer | Technology |
|-------|------------|
| Blockchain | XRPL DevNet with Multi-Purpose Tokens (MPT) |
| Wallet | Crossmark SDK |
| Backend | Next.js 14 API Routes, xrpl.js |
| Database | PostgreSQL with Prisma ORM |
| Frontend | Next.js 14, TailwindCSS, Framer Motion |
| Authentication | Better Auth |
| Metadata Standard | XLS-89 |
| Deployment | Vercel |

---

## 12. Evaluation Criteria

| Criterion | Terra.Fi Implementation |
|-----------|------------------------|
| Problem Resolution Potential | Addresses real-world liquidity gap in the $350T real estate market using XRPL-native tokenization |
| Technical Viability | Fully implemented with MPT, XLS-89, Crossmark Wallet, and on-chain collateral logic |
| Adoption Leverage | Promotes institutional-grade RWA adoption through compliance and liquidity features |
| Presentation Quality | Comprehensive documentation, structured repository, demo video, and live application |

---

## 13. Team

| Name | Role | Background |
|------|------|------------|
| André Mileto | Product and Architecture Lead | Dexcap — Infrastructure and Tokenization |
| Leandro Fernandes | XRPL Engineer | Backend Development, MPT Issuance, Freeze/Clawback |
| Raphael Fogaça | Frontend Engineer | Next.js, Crossmark Integration |

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Terra.Fi** — Making Land Liquid

Built for the XRPL Hackathon by Dexcap Labs
