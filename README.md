# FactoChain

**A Tokenized Invoice Factoring DApp for SME Financing**

FactoChain is a decentralized fintech application that enables SMEs to convert unpaid invoices into immediate working capital through blockchain-based tokenization. Invoices are tokenized as **ERC-1155 fractional assets**, allowing multiple investors to fund portions of the same invoice using ETH. Settlement is automated through a **Chainlink-compatible oracle** that verifies off-chain payment confirmations. Invoice documents are stored on **IPFS via Pinata**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│  Invoice Creation  │  Marketplace  │  Portfolio  │  MetaMask    │
└────────┬────────────────────┬───────────────────────┬───────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│  Backend/Oracle  │  │  IPFS (Pinata)   │  │  Ethereum Sepolia   │
│  (Node.js)       │  │  Document Storage │  │                     │
│                  │  │  Metadata Pins    │  │  InvoiceToken.sol   │
│  - IPFS Pinning  │  └──────────────────┘  │  (ERC-1155)         │
│  - Oracle Coord  │                        │                     │
│  - Payment Verify│──────────────────────▶ │  FundingPool.sol    │
│                  │  Chainlink-compatible   │                     │
│                  │  request/fulfillment    │  OracleGateway.sol  │
└──────────────────┘                        └─────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Smart Contracts | Solidity 0.8.20 | ERC-1155 tokenization, funding pool, oracle gateway |
| Token Standard | ERC-1155 | Fractional ownership of invoices |
| Dev Framework | Hardhat | Compile, test, deploy smart contracts |
| Frontend | React 18 + Vite | DApp user interface |
| Blockchain Lib | Ethers.js v6 | Wallet connection, contract interaction |
| Network | Ethereum Sepolia | Public testnet |
| Oracle | Chainlink-compatible | Off-chain payment verification |
| Off-chain Storage | IPFS (Pinata) | Invoice document persistence |
| Backend | Node.js + Express | API coordination, IPFS pinning, oracle relay |
| Wallet | MetaMask | Transaction signing |
| Testing | Hardhat + Chai | Unit and integration tests |

---

## Prerequisites

Before setting up FactoChain, ensure you have the following installed:

- **Node.js** v18+ and npm — [https://nodejs.org/](https://nodejs.org/)
- **MetaMask** browser extension — [https://metamask.io/](https://metamask.io/)
- **Git** — [https://git-scm.com/](https://git-scm.com/)

You will also need accounts for:

- **Infura or Alchemy** — Sepolia RPC endpoint ([https://infura.io/](https://infura.io/) or [https://alchemy.com/](https://alchemy.com/))
- **Etherscan** — API key for contract verification ([https://etherscan.io/apis](https://etherscan.io/apis))
- **Pinata** — IPFS pinning service ([https://pinata.cloud/](https://pinata.cloud/))
- **Sepolia ETH** — Testnet faucet ([https://sepoliafaucet.com/](https://sepoliafaucet.com/))

---

## Installation & Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/<linuskohhh>/factochain.git
cd factochain
```

### Step 2: Install Smart Contract Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```env
# Get from Infura/Alchemy dashboard
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# Export from MetaMask (Settings > Security > Export Private Key)
# Use a DEDICATED testnet wallet, never your mainnet wallet
DEPLOYER_PRIVATE_KEY=your_private_key

# Get from etherscan.io/apis
ETHERSCAN_API_KEY=your_key

# Get from Pinata dashboard (API Keys > New Key > JWT)
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=your_gateway.mypinata.cloud

# Oracle wallet (can be same as deployer for testnet)
ORACLE_PRIVATE_KEY=your_oracle_private_key
```

### Step 4: Compile Smart Contracts

```bash
npx hardhat compile
```

This generates ABI artifacts in `./artifacts/contracts/`.

### Step 5: Run Tests

```bash
npx hardhat test
```

Expected output: All tests passing across InvoiceToken, FundingPool, OracleGateway, and end-to-end flow.

### Step 6: Deploy to Local Hardhat Network (Optional)

For local testing:

```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy
npx hardhat run scripts/deploy.js --network hardhat
```

### Step 7: Deploy to Sepolia Testnet

Ensure your deployer wallet has Sepolia ETH from a faucet.

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

After deployment, the script outputs contract addresses and saves them to `deployment.json`. Copy the addresses into your `.env` file:

```env
INVOICE_TOKEN_ADDRESS=0x...
FUNDING_POOL_ADDRESS=0x...
ORACLE_GATEWAY_ADDRESS=0x...

# Also set for frontend
VITE_INVOICE_TOKEN_ADDRESS=0x...
VITE_FUNDING_POOL_ADDRESS=0x...
VITE_ORACLE_GATEWAY_ADDRESS=0x...
```

### Step 8: Verify Contracts on Etherscan (Optional)

```bash
npx hardhat verify --network sepolia INVOICE_TOKEN_ADDRESS
npx hardhat verify --network sepolia FUNDING_POOL_ADDRESS "INVOICE_TOKEN_ADDRESS"
npx hardhat verify --network sepolia ORACLE_GATEWAY_ADDRESS "FUNDING_POOL_ADDRESS"
```

### Step 9: Install and Start Backend

```bash
cd backend
npm install
npm start
```

The backend runs on `http://localhost:4000` and provides:
- `POST /api/ipfs/upload` — Upload documents to IPFS
- `POST /api/ipfs/metadata` — Pin JSON metadata to IPFS
- `POST /api/oracle/confirm-payment` — Trigger oracle payment confirmation
- `POST /api/oracle/trigger-settlement` — Execute settlement
- `GET /api/oracle/status/:tokenId` — Check confirmation status

### Step 10: Install and Start Frontend

```bash
cd ../frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` with API proxy to the backend.

### Step 11: Configure MetaMask

1. Open MetaMask and switch to **Sepolia Test Network**
2. Ensure your wallet has Sepolia ETH
3. Navigate to `http://localhost:3000` and click **Connect Wallet**

---

## Usage Walkthrough

### As an SME (Invoice Issuer)

1. Connect your wallet on the FactoChain dashboard
2. Navigate to **Create Invoice** tab
3. Fill in invoice details: face value (ETH), number of fractional shares, discount rate, due date
4. Upload the invoice PDF document (stored on IPFS)
5. Click **Mint Invoice Token** — this creates an ERC-1155 token with the specified number of shares
6. The invoice appears on the marketplace for investors to fund

### As an Investor

1. Connect your wallet and navigate to **Marketplace**
2. Browse open invoices with transparent terms (face value, share price, discount, due date)
3. Enter the number of shares to purchase and click **Fund**
4. Sign the MetaMask transaction to send ETH
5. Once an invoice is fully funded, the SME receives the discounted ETH
6. After debtor payment is confirmed via oracle, claim your returns in **My Portfolio**

### Oracle Settlement (Admin/Demo)

Payment confirmation and settlement are triggered via the backend API:

```bash
# Step 1: Confirm payment for invoice #1
curl -X POST http://localhost:4000/api/oracle/confirm-payment \
  -H "Content-Type: application/json" \
  -d '{"tokenId": 1, "paymentRef": "BANK_REF_123"}'

# Step 2: Trigger settlement (distributes face value to investors)
curl -X POST http://localhost:4000/api/oracle/trigger-settlement \
  -H "Content-Type: application/json" \
  -d '{"tokenId": 1}'
```

---

## Smart Contract Architecture

### InvoiceToken.sol (ERC-1155)

Manages fractional invoice tokenization. Each invoice gets a unique token ID with a configurable supply of fungible shares.

**Key functions:**
- `mintInvoice()` — Create invoice token with shares, metadata URI pointing to IPFS
- `cancelInvoice()` — Cancel before funding
- `updateState()` — State transitions (restricted to authorized contracts)

**Why ERC-1155 over ERC-721?** ERC-721 tokens are indivisible — you cannot split an NFT into fractions. ERC-1155 supports minting multiple fungible copies of the same token ID, enabling multiple investors to each hold shares of the same invoice. This is essential for a multi-investor funding marketplace.

### FundingPool.sol

Manages ETH deposits, proportional share tracking, and settlement distribution.

**Key functions:**
- `fundInvoice()` — Investors send ETH to purchase shares
- `settleInvoice()` — Distribute face value proportionally (called by OracleGateway)
- `claimFunds()` — Pull pattern for investor withdrawals
- `markDefault()` — Admin marks past-due unfulfilled invoices

### OracleGateway.sol

Chainlink-compatible interface for off-chain payment verification.

**Key functions:**
- `requestPaymentConfirmation()` — Create oracle request
- `fulfillPaymentConfirmation()` — Process oracle response with proof hash
- `triggerSettlement()` — Forward settlement ETH to FundingPool

**Oracle Design:** The POC uses a simulated Chainlink pattern where the backend acts as the oracle operator, following the same request/fulfillment interface. Production deployment would use Chainlink external adapters executed by decentralized node operators.

---

## IPFS Integration

Invoice documents and token metadata are stored on IPFS via the Pinata pinning service:

1. **Document Upload:** Invoice PDFs are uploaded to IPFS, returning a Content Identifier (CID)
2. **Metadata Assembly:** ERC-1155 metadata JSON includes the document CID, invoice details, and issuer info
3. **Metadata Pinning:** The JSON is pinned to IPFS, and its CID becomes the token's `metadataURI`
4. **Verification:** Anyone can fetch the CID from IPFS and verify document integrity against on-chain metadata

This ensures tamper-proof document storage without blockchain bloat.

---

## Security Features

- **Access Control:** OpenZeppelin `AccessControl` with distinct MINTER_ROLE, ORACLE_ROLE, ADMIN_ROLE
- **Reentrancy Protection:** `ReentrancyGuard` on all ETH-transferring functions
- **Checks-Effects-Interactions:** State updates before external calls in settlement
- **Pull Payment Pattern:** Investors claim settled funds explicitly (not auto-pushed)
- **State Machine:** Explicit enum states with validated transitions
- **Input Validation:** Positive amounts, non-zero addresses, Solidity 0.8.x overflow protection
- **Oracle Replay Prevention:** Request ID tracking prevents duplicate fulfillments

---

## Project Structure

```
factochain/
├── contracts/                  # Solidity smart contracts
│   ├── InvoiceToken.sol        # ERC-1155 fractional invoice tokens
│   ├── FundingPool.sol         # ETH funding pool + settlement
│   └── OracleGateway.sol       # Chainlink-compatible oracle interface
├── scripts/
│   └── deploy.js               # Deployment script for all contracts
├── test/
│   └── FactoChain.test.js      # Comprehensive test suite
├── frontend/                   # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx             # Main dashboard (Marketplace, Create, Portfolio)
│   │   ├── main.jsx            # Entry point
│   │   └── utils/
│   │       └── contracts.js    # Contract ABIs, wallet connection, IPFS helpers
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/                    # Node.js backend service
│   ├── server.js               # Express server entry
│   ├── routes/
│   │   ├── ipfs.js             # IPFS upload + metadata pinning via Pinata
│   │   └── oracle.js           # Oracle payment confirmation + settlement
│   └── package.json
├── hardhat.config.js           # Hardhat configuration
├── package.json                # Root dependencies (Solidity, Hardhat, OpenZeppelin)
├── .env.example                # Environment variable template
├── .gitignore
└── README.md                   # This file
```

---

## Testing

Run the full test suite:

```bash
npx hardhat test
```

Test coverage includes:

**InvoiceToken Tests:**
- Minting with correct parameters and share price calculation
- Unauthorized minting rejection
- Input validation (zero value, past due date)
- Invoice cancellation
- Metadata URI retrieval
- Multiple invoice tracking

**FundingPool Tests:**
- Single and multi-investor funding
- State transition to Funded when target reached
- SME payment on full funding (minus 1% platform fee)
- Overfunding rejection
- Zero ETH rejection
- Excess ETH refund

**OracleGateway Tests:**
- Oracle request creation
- Payment fulfillment with proof hash
- Duplicate fulfillment rejection
- Settlement trigger with investor fund distribution
- Unauthorized access rejection

**End-to-End Test:**
- Complete lifecycle: mint → fund (multi-investor) → oracle confirm → settle → claim
- Proportional distribution verification (60/40 split)

---

## Gas Costs (Sepolia Testnet)

| Operation | Estimated Gas | Approximate Cost |
|-----------|--------------|-----------------|
| Mint Invoice (ERC-1155) | ~180,000 | $3–5 |
| Fund Invoice | ~90,000 | $2–3 |
| Oracle Confirm Payment | ~120,000 | $2–4 |
| Trigger Settlement | ~200,000 | $4–6 |
| Claim Funds | ~50,000 | $1–2 |

---

## Team

| Member | Role | Responsibilities |
|--------|------|-----------------|
| Linus Koh Jiang Zhen | Smart Contract Dev | InvoiceToken, FundingPool, OracleGateway, Hardhat tests |
| Antonio Au | Frontend Dev | React dashboard, MetaMask integration, Ethers.js |
| Cheow Ming Yang | Backend & Oracle | Node.js service, IPFS/Pinata integration, oracle coordination |
| Max Tan | Research & Architecture | System design, documentation, Chainlink/IPFS research |
| Phua Si En | Testing, Deployment & Demo | Hardhat test suite, Sepolia deployment, Etherscan verification, pre-recorded demo |

---

## License

MIT
