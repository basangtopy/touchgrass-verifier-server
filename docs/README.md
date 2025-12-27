# TouchGrass Verifier Server

> AI-powered challenge verification service for the TouchGrass accountability protocol.

## Overview

The Verifier Server is the trusted off-chain verification component that:

1. Receives challenge verification requests from users
2. Uses GPT-4 Vision to analyze photo evidence
3. Calls the smart contract's `verifySuccess()` when evidence is valid

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   User App  │────▶│  Verifier Server │────▶│ Smart Contract│
│  (Frontend) │     │   (This Server)  │     │  (Blockchain) │
└─────────────┘     └──────────────────┘     └───────────────┘
       │                     │
       │ 1. Submit photo     │ 2. AI Analysis
       │    + challenge ID   │ 3. Sign transaction
       └─────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- An OpenRouter API key (for GPT-4 Vision)
- The verifier wallet private key
- Access to an Ethereum RPC endpoint

### Installation

```bash
cd "TouchGrass Verifier Server"
npm install
```

### Configuration

Create a `.env` file:

```env
# Required
VERIFIER_PRIVATE_KEY=0x...        # Private key for signing transactions
CONTRACT_ADDRESS=0x...            # TouchGrass contract address
OPENROUTER_API_KEY=sk-or-...      # OpenRouter API key for GPT-4 Vision

# Optional
PORT=3001                         # Server port (default: 3001)
RPC_URL=http://127.0.0.1:8545     # Ethereum RPC endpoint
ALLOWED_ORIGINS=http://localhost:5173,https://yourapp.com
SITE_URL=https://yourapp.com      # For OpenRouter headers
SITE_NAME=TouchGrass              # App name for OpenRouter
```

### Run the Server

```bash
# Development
node index.js

# Production (with PM2)
pm2 start index.js --name verifier-server
```

## Documentation

| Document                                            | Description                                |
| --------------------------------------------------- | ------------------------------------------ |
| [API Reference](./api-reference.md)                 | Complete API specification                 |
| [Deployment Guide](./deployment-guide.md)           | Production deployment instructions         |
| [AI Verification Guide](./ai-verification-guide.md) | How the AI verification works              |
| [Security Guide](./security-guide.md)               | Security considerations and best practices |

## Architecture

```
index.js
├── Environment Validation     # Fail-fast on missing config
├── Express Setup              # CORS, JSON parsing, rate limiting
├── Blockchain Setup           # ethers.js provider + contract
├── OpenAI Setup               # GPT-4 Vision via OpenRouter
├── /health endpoint           # Health check for monitoring
├── /api/verify endpoint       # Main verification endpoint
└── Graceful Shutdown          # SIGTERM/SIGINT handlers
```

## License

MIT
