# Security Guide

> Security considerations and best practices for the TouchGrass Verifier Server.

---

## Threat Model

The Verifier Server is a critical piece of infrastructure that:

- Holds a private key that can mark challenges as successful
- Receives user-submitted content (images)
- Makes blockchain transactions

### Assets at Risk

| Asset                | Risk if Compromised                       |
| -------------------- | ----------------------------------------- |
| Verifier private key | Attacker can verify fraudulent challenges |
| Server access        | Full control over verification            |
| OpenRouter API key   | Cost abuse, rate limit abuse              |

---

## Private Key Security

### DO ✅

- Store private key in environment variables
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Use a dedicated wallet ONLY for verification
- Keep minimal ETH balance (enough for gas only)
- Rotate keys periodically

### DON'T ❌

- Commit private key to git
- Share private key between environments
- Use the contract owner's wallet for verification
- Store large amounts of ETH in the verifier wallet

### Key Separation

```
┌─────────────────┐     ┌─────────────────┐
│ Contract Owner  │     │    Verifier     │
│ (Admin wallet)  │     │ (Server wallet) │
├─────────────────┤     ├─────────────────┤
│ - Owns contract │     │ - Only verifies │
│ - Can pause     │     │ - Minimal ETH   │
│ - Can withdraw  │     │ - Disposable    │
│ - HIGH VALUE    │     │ - LOW VALUE     │
└─────────────────┘     └─────────────────┘
        │                        │
        └──── MUST BE DIFFERENT ─┘
```

---

## API Security

### Rate Limiting

The server implements rate limiting:

```javascript
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 requests
});
```

**Why:** Prevents DoS attacks and limits AI API costs.

### CORS Restrictions

Only whitelisted origins can access the API:

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:5173",
];
```

**Configure for production:**

```env
ALLOWED_ORIGINS=https://app.touchgrass.com,https://admin.touchgrass.com
```

### Input Validation

All inputs are validated before processing:

```javascript
if (!challengeId || !title || !imageUrl) {
  return res.status(400).json({ success: false, message: "..." });
}

if (typeof title !== "string" || title.length > 500) {
  return res.status(400).json({ success: false, message: "..." });
}

if (!imageUrl.startsWith("data:image/")) {
  return res.status(400).json({ success: false, message: "..." });
}
```

### Payload Size Limit

```javascript
app.use(express.json({ limit: "10mb" }));
```

Prevents memory exhaustion from large payloads.

---

## Infrastructure Security

### HTTPS

**ALWAYS use HTTPS in production.**

- Use a reverse proxy (Nginx, Cloudflare) with SSL
- Never expose HTTP port directly
- Force HTTPS redirects

### Network Isolation

- Server only needs outbound access to:
  - OpenRouter API (HTTPS)
  - Ethereum RPC (HTTPS)
- No inbound access needed except HTTP(S)
- Use firewall rules to restrict

### Process Isolation

```bash
# Run as non-root user
sudo useradd -r -s /bin/false verifier
sudo chown -R verifier:verifier /app

# With PM2
pm2 start index.js --user verifier
```

---

## Error Handling

### No Internal Leakage

The server categorizes errors and returns generic messages:

```javascript
// BAD: Leaks internal details
res.status(500).json({ error: error.stack });

// GOOD: Generic message
res.status(500).json({
  success: false,
  message: "Verification process failed.",
});
```

### Logging

Sensitive data is NOT logged:

- Private keys
- Full image data
- Internal stack traces (in production)

```javascript
console.log(`🔍 Verifying Challenge #${challengeId}: "${title}"`);
console.log(`   Image: ${imageUrl.substring(0, 50)}...`); // Truncated
```

---

## AI Security

### Prompt Injection

The system prompt is designed to resist manipulation:

1. **Strict output format** - Only YES/NO responses
2. **No system prompt exposure** - AI shouldn't reveal instructions
3. **Clear rejection criteria** - Defines what to ignore

### Image Content

- Images are sent to OpenRouter/OpenAI
- OpenAI has content moderation
- Consider adding pre-moderation for illegal content

### Cost Protection

- Rate limiting prevents runaway costs
- Monitor OpenRouter dashboard for unusual usage
- Set spending limits in OpenRouter

---

## Operational Security

### Secrets Rotation

| Secret               | Rotation Frequency | How                                  |
| -------------------- | ------------------ | ------------------------------------ |
| Verifier private key | Quarterly          | Generate new wallet, update contract |
| OpenRouter API key   | As needed          | Regenerate in dashboard              |
| Server access        | On staff change    | Rotate SSH keys                      |

### Monitoring

Set up alerts for:

- High error rates
- Rate limit exhaustion
- Unusual transaction patterns
- Server downtime

### Incident Response

If the verifier key is compromised:

1. **Immediately** call `setVerifier(newAddress)` from owner wallet
2. Rotate to new verifier wallet
3. Update server configuration
4. Investigate how key was leaked

---

## Security Checklist

### Before Going Live

- [ ] Private key stored in secrets manager (not in code)
- [ ] HTTPS enabled with valid certificate
- [ ] CORS restricted to production domains
- [ ] Rate limiting enabled
- [ ] Verifier wallet is NOT the owner wallet
- [ ] OpenRouter spending limits set
- [ ] Error messages don't leak internals
- [ ] Logging doesn't include sensitive data

### Ongoing

- [ ] Monitor for unusual activity
- [ ] Review access logs regularly
- [ ] Keep dependencies updated
- [ ] Rotate secrets periodically
- [ ] Test incident response plan
