# Deployment Guide

> Production deployment instructions for the TouchGrass Verifier Server.

---

## Infrastructure Requirements

### Minimum Specifications

| Resource | Requirement           |
| -------- | --------------------- |
| CPU      | 1 vCPU                |
| RAM      | 512 MB                |
| Storage  | 1 GB                  |
| Network  | Outbound HTTPS access |

### Services Needed

| Service      | Purpose                | Provider Examples                      |
| ------------ | ---------------------- | -------------------------------------- |
| Hosting      | Run the Node.js server | Railway, Render, DigitalOcean, AWS EC2 |
| RPC Endpoint | Blockchain access      | Alchemy, Infura, QuickNode             |
| AI API       | GPT-4 Vision           | OpenRouter                             |

---

## Environment Variables

### Required

```env
# Verifier wallet private key (with ETH for gas)
VERIFIER_PRIVATE_KEY=0xabc123...

# TouchGrass smart contract address
CONTRACT_ADDRESS=0xdef456...

# OpenRouter API key for GPT-4 Vision
OPENROUTER_API_KEY=sk-or-v1-abc123...
```

### Optional

```env
# Server port (default: 3001)
PORT=3001

# Ethereum RPC URL (default: localhost:8545)
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Comma-separated allowed origins for CORS
ALLOWED_ORIGINS=https://app.touchgrass.com,https://admin.touchgrass.com

# For OpenRouter request attribution
SITE_URL=https://touchgrass.com
SITE_NAME=TouchGrass
```

---

## Deployment Options

### Option 1: Railway (Recommended for simplicity)

1. **Create Railway project**

   ```bash
   railway login
   railway init
   ```

2. **Add environment variables**

   - Go to Railway dashboard → Variables
   - Add all required environment variables

3. **Deploy**

   ```bash
   railway up
   ```

4. **Get public URL**
   - Railway provides a public URL automatically
   - Update your frontend `.env` with this URL

### Option 2: Render

1. **Create Web Service**

   - Connect your GitHub repo
   - Select "TouchGrass Verifier Server" directory

2. **Configure**

   - Build Command: `npm install`
   - Start Command: `node index.js`
   - Add environment variables

3. **Deploy**
   - Render auto-deploys on push

### Option 3: VPS with PM2

1. **Setup server**

   ```bash
   # Install Node.js 18+
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2
   npm install -g pm2
   ```

2. **Clone and configure**

   ```bash
   git clone <your-repo> touchgrass
   cd touchgrass/TouchGrass\ Verifier\ Server
   npm install
   cp .env.example .env
   nano .env  # Edit with your values
   ```

3. **Start with PM2**

   ```bash
   pm2 start index.js --name verifier
   pm2 save
   pm2 startup  # Auto-start on reboot
   ```

4. **Setup reverse proxy (Nginx)**
   ```nginx
   server {
       listen 443 ssl;
       server_name verifier.yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

---

## Pre-Deployment Checklist

### 1. Verifier Wallet Setup

- [ ] Generate a dedicated wallet for the verifier
- [ ] Fund it with ETH for gas (0.01+ ETH recommended)
- [ ] **NEVER** use the same wallet as the contract owner
- [ ] Store private key securely (use secrets manager in production)

### 2. Contract Configuration

- [ ] Verifier address is set in the smart contract
- [ ] Contract is deployed and verified
- [ ] Contract address is correct in `.env`

### 3. API Keys

- [ ] OpenRouter account created
- [ ] API key generated with sufficient credits
- [ ] Rate limits understood (OpenRouter limits apply)

### 4. Security

- [ ] HTTPS only (no HTTP in production)
- [ ] CORS origins restricted to your domains
- [ ] Environment variables in secure storage (not in code)
- [ ] Private key not committed to git

---

## Monitoring

### Health Check Endpoint

Use `/health` for uptime monitoring:

```bash
curl https://your-verifier.com/health
```

Response:

```json
{ "status": "ok", "timestamp": 1703644800000, "contract": "0x..." }
```

### PM2 Monitoring

```bash
pm2 monit           # Real-time dashboard
pm2 logs verifier   # View logs
pm2 status          # Process status
```

### Log Aggregation

The server logs:

- Incoming verification requests
- AI responses (YES/NO)
- Transaction hashes
- Errors with categories

Consider using log aggregation services:

- Papertrail
- Logtail
- AWS CloudWatch

---

## Scaling Considerations

### Rate Limits

| Component            | Limit              | Notes                         |
| -------------------- | ------------------ | ----------------------------- |
| Express rate limiter | 5 req/10min per IP | Configurable in code          |
| OpenRouter           | Varies by plan     | Check your plan limits        |
| Blockchain RPC       | Varies by provider | Use paid plans for production |

### Horizontal Scaling

The server is stateless and can be scaled horizontally:

- Use a load balancer (nginx, HAProxy)
- All instances use the same verifier wallet
- Nonce management is handled by the RPC provider

### Cost Estimation

| Component    | Cost Driver        | Estimate                           |
| ------------ | ------------------ | ---------------------------------- |
| GPT-4 Vision | Per image analysis | ~$0.01-0.03 per verification       |
| Gas fees     | Per transaction    | Depends on network (Base is cheap) |
| Hosting      | Server uptime      | $5-20/month                        |
| RPC          | Requests           | Free tiers often sufficient        |

---

## Troubleshooting

### Common Issues

**"AI verification timeout"**

- The 60-second timeout was exceeded
- OpenRouter may be overloaded
- Try again or check OpenRouter status

**"Challenge may already be verified"**

- The `verifySuccess()` call reverted
- Challenge was already verified
- Challenge doesn't exist

**"Rate limit exceeded"**

- Too many requests from same IP
- Wait 10 minutes or adjust limits

**"CORS blocked"**

- Origin not in `ALLOWED_ORIGINS`
- Add the frontend domain to allowed list

### Debugging

Set `DEBUG=true` in environment for verbose logging:

```env
DEBUG=true
```

Check logs for:

```
🔍 Verifying Challenge #42: "Run 5km"
🤖 AI Response: YES
✅ AI Approved. Signing transaction...
🚀 Transaction Sent: 0x...
🔗 Confirmed on-chain.
```
