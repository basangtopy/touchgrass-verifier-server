# API Reference

> Complete API documentation for the TouchGrass Verifier Server.

---

## Base URL

```
Development: http://localhost:3001
Production:  https://your-verifier-domain.com
```

---

## Endpoints

### Health Check

Check if the server is running and configured correctly.

```http
GET /health
```

#### Response

```json
{
  "status": "ok",
  "timestamp": 1703644800000,
  "contract": "0x..."
}
```

| Field       | Type   | Description                      |
| ----------- | ------ | -------------------------------- |
| `status`    | string | Always "ok" if server is running |
| `timestamp` | number | Current server time (Unix ms)    |
| `contract`  | string | Configured contract address      |

---

### Verify Challenge

Submit photo evidence for AI verification. If approved, the server calls `verifySuccess()` on-chain.

```http
POST /api/verify
Content-Type: application/json
```

#### Request Body

```json
{
  "challengeId": "42",
  "title": "Run 5km",
  "imageUrl": "data:image/jpeg;base64,..."
}
```

| Field         | Type          | Required | Description                             |
| ------------- | ------------- | -------- | --------------------------------------- |
| `challengeId` | string/number | ✅       | The on-chain challenge ID               |
| `title`       | string        | ✅       | The challenge objective (max 500 chars) |
| `imageUrl`    | string        | ✅       | Base64 data URL of the photo evidence   |

#### Success Response (200)

```json
{
  "success": true,
  "txHash": "0x1234567890abcdef..."
}
```

| Field     | Type    | Description                 |
| --------- | ------- | --------------------------- |
| `success` | boolean | Always `true` on success    |
| `txHash`  | string  | Blockchain transaction hash |

#### Error Responses

**400 Bad Request** - Validation failed or AI rejected the evidence

```json
{
  "success": false,
  "message": "AI could not verify the objective based on the photo provided."
}
```

**429 Too Many Requests** - Rate limit exceeded

```json
{
  "success": false,
  "message": "Too many verification attempts. Please try again in 10 minutes."
}
```

**504 Gateway Timeout** - AI took too long

```json
{
  "success": false,
  "message": "AI verification timed out. Please try again."
}
```

**500 Internal Server Error** - Server error

```json
{
  "success": false,
  "message": "Verification process failed. Please try again."
}
```

---

## Rate Limiting

The `/api/verify` endpoint is rate-limited to prevent abuse and control AI costs.

| Limit      | Window     | Scope          |
| ---------- | ---------- | -------------- |
| 5 requests | 10 minutes | Per IP address |

Rate limit headers are included in responses:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

---

## CORS

The server enforces CORS restrictions based on the `ALLOWED_ORIGINS` environment variable.

```env
ALLOWED_ORIGINS=http://localhost:5173,https://app.touchgrass.com
```

Requests from non-whitelisted origins will be blocked with a CORS error.

---

## Error Codes

| HTTP Code | Meaning           | Common Causes                              |
| --------- | ----------------- | ------------------------------------------ |
| 400       | Bad Request       | Missing fields, invalid data, AI rejection |
| 429       | Too Many Requests | Rate limit exceeded                        |
| 500       | Server Error      | Blockchain error, AI error                 |
| 504       | Gateway Timeout   | AI took > 60 seconds                       |

---

## Example Usage

### JavaScript (Frontend)

```javascript
async function verifyChallenge(challengeId, title, imageDataUrl) {
  const response = await fetch("http://localhost:3001/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId,
      title,
      imageUrl: imageDataUrl,
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log("Verified! TX:", result.txHash);
  } else {
    console.error("Verification failed:", result.message);
  }
}
```

### cURL

```bash
curl -X POST http://localhost:3001/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "challengeId": "42",
    "title": "Run 5km",
    "imageUrl": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
```

---

## Blockchain Interaction

When verification succeeds, the server calls:

```solidity
contract.verifySuccess(challengeId, { gasLimit: 200000 })
```

The transaction is signed by the verifier wallet configured in `VERIFIER_PRIVATE_KEY` and submitted to the RPC endpoint configured in `RPC_URL`.

**Important:** The verifier wallet address must match the `verifier` address set in the TouchGrass smart contract.
