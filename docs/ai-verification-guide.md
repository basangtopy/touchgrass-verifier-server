# AI Verification Guide

> How the GPT-4 Vision verification system works in the TouchGrass Verifier Server.

---

## Overview

The verification system uses GPT-4 Vision to analyze photo evidence submitted by users. The AI acts as a strict "accountability judge" that determines whether the submitted image proves task completion.

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ User submits │────▶│  GPT-4 Vision   │────▶│ YES = Verify │
│    photo     │     │ analyzes image  │     │  NO = Reject │
└──────────────┘     └─────────────────┘     └──────────────┘
```

---

## The Verification Prompt

The AI receives a detailed system prompt that defines:

1. **Context** - This is a high-stakes accountability protocol with real money
2. **Evidence types** - What kinds of proof are acceptable
3. **Verification logic** - How to evaluate evidence
4. **Rejection criteria** - What to reject

### Acceptable Evidence Types

| Category               | Examples                                             |
| ---------------------- | ---------------------------------------------------- |
| **Digital Dashboards** | Strava, Apple Health, Google Fit, Fitbit screenshots |
| **Physical Evidence**  | Sweaty selfie, open book, completed painting         |
| **Hardware Displays**  | Treadmill screen, smartwatch face, bike computer     |
| **System Interfaces**  | Screen Time summary, Focus Mode logs                 |
| **Environment**        | Location photos matching the task (hiking trail)     |

### Verification Logic

#### For Metric-Based Goals (Distance, Time, Count)

**Look for NUMBERS**

| Goal             | Weak Evidence ❌       | Strong Evidence ✅          |
| ---------------- | ---------------------- | --------------------------- |
| "Run 5km"        | Photo of running shoes | Watch showing "5.01 km"     |
| "Drink 3L water" | Photo of water bottle  | App showing "3000ml"        |
| "100 pushups"    | Photo of floor         | Fitness app with "100 reps" |

#### For Binary Goals (Did/Didn't Do)

**Look for STATE**

| Goal              | Weak Evidence ❌ | Strong Evidence ✅             |
| ----------------- | ---------------- | ------------------------------ |
| "Read for 1 hour" | Closed book      | Open book with visible pages   |
| "Cold plunge"     | Photo of tub     | Person IN the tub or timer     |
| "Meditate"        | Yoga mat         | Meditation app showing session |

#### For Abstinence Goals (Avoided Something)

**Look for SUMMARY REPORTS**

| Goal           | Weak Evidence ❌     | Strong Evidence ✅           |
| -------------- | -------------------- | ---------------------------- |
| "No Instagram" | Empty app folder     | Screen Time showing "0m"     |
| "No gaming"    | Gaming PC turned off | Usage stats with no playtime |

---

## Rejection Criteria

The AI will **immediately reject** submissions that:

| Issue                    | Example                                   |
| ------------------------ | ----------------------------------------- |
| **Blurry/unreadable**    | Can't see the numbers on the screen       |
| **Unrelated content**    | Black screen, random object               |
| **Contradicting data**   | Goal: "5km", Image shows: "2.1 km"        |
| **Stock photos**         | Watermarked, professional studio lighting |
| **Obvious manipulation** | Photoshopped numbers, edited text         |

---

## Response Format

The AI answers strictly with **YES** or **NO**.

```
User: Does this image verify "Run 5km"?
AI:   YES
```

The server checks for "YES" in the response:

```javascript
const isVerified = answer.trim().toUpperCase().includes("YES");
```

---

## AI Model Configuration

### Provider

The server uses **OpenRouter** as an AI gateway, which provides access to GPT-4 Vision.

```javascript
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### Model

```javascript
model: "openai/gpt-4o";
```

GPT-4o is used for its:

- High accuracy in image understanding
- Fast response times
- Reasonable cost per analysis

### Timeout

```javascript
const AI_TIMEOUT_MS = 60000; // 60 seconds
```

If the AI doesn't respond within 60 seconds, the request times out.

---

## Cost Considerations

| Aspect             | Details                                       |
| ------------------ | --------------------------------------------- |
| **Pricing**        | ~$0.01-0.03 per image (depends on image size) |
| **Token usage**    | System prompt is ~500 tokens                  |
| **Image encoding** | Images are sent as base64 data URLs           |

### Cost Optimization Tips

1. **Compress images** before upload (reduce base64 size)
2. **Rate limit** to prevent abuse (already implemented)
3. **Monitor usage** via OpenRouter dashboard
4. **Set spending limits** in OpenRouter settings

---

## Edge Cases

### Ambiguous Evidence

When evidence is borderline:

- AI tends toward rejection (false negatives over false positives)
- This protects the protocol's integrity
- Users can resubmit with clearer evidence

### Multiple Goals in One Image

If the challenge title mentions multiple tasks:

- AI checks for ALL requirements
- Partial completion = NO

### Non-English Content

- GPT-4 Vision can read most languages
- Fitness app screenshots work regardless of language
- Numbers are universal

---

## Customizing the Prompt

The system prompt can be modified in `index.js`:

```javascript
{
  role: "system",
  content: `You are the Verification Engine for "TouchGrass"...`
}
```

### When to Modify

- Adding new evidence types (e.g., VR fitness games)
- Adjusting strictness level
- Supporting specific app formats

### Caution

Changes affect all verifications. Test thoroughly before deploying:

- Test with valid evidence → should pass
- Test with invalid evidence → should fail
- Test edge cases → should fail safely

---

## Troubleshooting

### "AI could not verify the objective"

**Possible causes:**

- Image doesn't show clear evidence
- Numbers/data are too small to read
- Image is unrelated to the task

**Solutions:**

- Take a clearer photo
- Zoom in on relevant data
- Ensure the goal matches the evidence type

### "AI verification timeout"

**Possible causes:**

- OpenRouter is slow/overloaded
- Network issues
- Large image taking too long

**Solutions:**

- Wait and retry
- Compress the image
- Check OpenRouter status page

### False Negatives (Should have passed)

**Common reasons:**

- Task title too vague ("Exercise" vs "Run 5km")
- Evidence type not recognized
- Image quality too low

**Improvements:**

- Use specific, measurable task titles
- Take screenshots rather than photos of screens
- Ensure good lighting and focus

---

## Security Considerations

### Image Data

- Images are NOT stored by the server
- Images are sent to OpenRouter/OpenAI for analysis
- OpenRouter's privacy policy applies

### Prompt Injection

The system prompt is designed to resist manipulation:

- Strict YES/NO output format
- Clear rejection criteria
- No conversational responses

### Abuse Prevention

- Rate limiting (5 requests per 10 minutes per IP)
- Image size limits (10MB max)
- Input validation on all fields
