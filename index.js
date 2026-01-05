require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { ethers } = require("ethers");
const OpenAI = require("openai");

// ===== ENVIRONMENT VALIDATION =====
// Fail fast at startup if required env vars are missing
const requiredEnvVars = [
  "VERIFIER_PRIVATE_KEY",
  "CONTRACT_ADDRESS",
  "OPENROUTER_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ FATAL: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3001;
const PROVIDER_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ABI = ["function verifySuccess(uint256 _id) external"];

// Parse allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) =>
  o.trim()
) || ["http://localhost:5173"];

// ===== SETUP =====
const app = express();

// CORS with origin whitelist
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ Blocked request from unauthorized origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.json({ limit: "10mb" })); // Limit payload size for image URLs

// Rate limiting - protect against DoS and excessive API costs
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 verification requests per 10 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Please try again in 10 minutes.",
  },
});

// ===== BLOCKCHAIN SETUP =====
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

// ===== AI SETUP =====
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.SITE_URL || "http://localhost:5173",
    "X-Title": process.env.SITE_NAME || "TouchGrass",
  },
});

// AI request timeout (60 seconds)
const AI_TIMEOUT_MS = 60000;

// ===== HEALTH CHECK ENDPOINT =====
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    contract: CONTRACT_ADDRESS,
  });
});

// ===== FARCASTER IDENTITY PROXY ENDPOINT =====
// Proxies requests to Neynar API to keep API key secure
const farcasterLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many identity lookups. Please try again later.",
  },
});

app.get("/api/farcaster/:address", farcasterLimiter, async (req, res) => {
  const { address } = req.params;

  // Validate address format
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Ethereum address format",
    });
  }

  const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

  if (!NEYNAR_API_KEY) {
    // Silently fail if Neynar not configured - identity will fallback to other sources
    return res.status(503).json({
      success: false,
      message: "Farcaster lookup not available",
    });
  }

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.warn(`Neynar API error: ${response.status}`);
      return res.status(response.status).json({
        success: false,
        message: "Farcaster lookup failed",
      });
    }

    const data = await response.json();
    const user = data[address.toLowerCase()]?.[0];

    if (user) {
      res.json({
        success: true,
        name: user.display_name || user.username,
        avatar: user.pfp_url,
      });
    } else {
      res.json({ success: false, message: "No Farcaster profile found" });
    }
  } catch (error) {
    console.error("Farcaster proxy error:", error.message);
    res.status(500).json({
      success: false,
      message: "Farcaster lookup failed",
    });
  }
});

// ===== VERIFICATION ENDPOINT =====
app.post("/api/verify", verifyLimiter, async (req, res) => {
  const { challengeId, title, imageUrl } = req.body;

  // Input validation
  if (!challengeId || !title || !imageUrl) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: challengeId, title, imageUrl",
    });
  }

  if (isNaN(Number(challengeId))) {
    return res.status(400).json({
      success: false,
      message: "challengeId must be a valid number",
    });
  }

  if (typeof title !== "string" || title.length > 500) {
    return res.status(400).json({
      success: false,
      message: "title must be a string under 500 characters",
    });
  }

  if (typeof imageUrl !== "string") {
    return res.status(400).json({
      success: false,
      message: "imageUrl must be a valid URL",
    });
  }

  console.log(`\n🔍 Verifying Challenge #${challengeId}: "${title}"`);
  console.log(`   Image: ${imageUrl.substring(0, 50)}...`);

  try {
    // AI verification with timeout
    const aiPromise = openai.chat.completions.create({
      model: "openai/gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are the Verification Engine for "TouchGrass," a high-stakes accountability protocol where users stake real money on completing health and productivity goals. Your job is to analyze image evidence and determine—with high integrity—if the user completed their specific objective.

          ### 1. THE INPUTS
          You will receive:
          A. The User's Stated Objective (e.g., "Run 5km", "Read 20 pages", "No Screen Time for 2 hours").
          B. An Image Proof uploaded by the user.

          ### 2. ACCEPTABLE EVIDENCE TYPES
          Users may upload a wide variety of proofs. You must be flexible in recognizing valid evidence formats, including but not limited to:

          * **Digital Dashboards:** Screenshots from fitness apps (Strava, Apple Health, Google Fit, Fitbit, Garmin) showing stats like distance, steps, heart rate, or sleep data.
          * **Physical Evidence:** Photos of the activity in progress or completed (e.g., an open book, a completed painting, a sweaty selfie at the gym, an empty water bottle next to a full one).
          * **Hardware Displays:** Photos taken of treadmill screens, Apple Watch/Smartwatch faces, bike computers, or gym machine counters.
          * **System Interfaces:** Screenshots of "Screen Time" settings, "Focus Mode" summaries, or "App Timer" logs showing usage limits were respected.
          * **Environment:** Photos of a specific location if the task implies it (e.g., a photo of a hiking trail view for "Go for a hike").

          ### 3. VERIFICATION LOGIC (STRICT)
          To mark a challenge as "VERIFIED", the image must contain **verifiable data** or **strong contextual visual proof** that links directly to the specific objective.

          * **For Metric-Based Goals (Distance, Time, Count):**
              * Look for **Numbers**. If the goal is "Run 5km", a picture of running shoes is FAIL. A picture of a watch showing "5.01 km" is PASS.
              * If the goal is "Drink 3L water", a picture of a water bottle is weak. A picture of a tracking app showing "3000ml" or a timestamped photo series is PASS.
          * **For Binary Goals (Read, Meditate, Cold Plunge):**
              * Look for **State**. An open book implies reading. A closed book does not. A picture of a cold plunge tub is weak; a picture of a person *in* the tub or a timer next to it is PASS.
          * **For Abstinence Goals (No Social Media):**
              * Look for **Summary Reports**. A screenshot of a Screen Time dashboard showing "0m on Instagram" is PASS.

          ### 4. REJECTION CRITERIA (FALSE POSITIVES)
          Reject the submission immediately if:
          * The image is too blurry to read key numbers/text.
          * The image is completely unrelated (e.g., a black screen, a random object).
          * The data in the image clearly contradicts the goal (e.g., Goal: "Run 5km", Image shows: "2.1 km").
          * The image looks like a generic stock photo (watermarked or highly professional studio lighting).

          ### 5. OUTPUT FORMAT
          Answer strictly with YES or NO. Do not write any conversational text`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a strict accountability judge. Does this image clearly verify that the user completed the task: "${title}"? Answer strictly with YES or NO.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("AI verification timeout")),
        AI_TIMEOUT_MS
      )
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);

    const answer = response.choices[0].message.content;
    console.log(`🤖 AI Response: ${answer}`);

    const isVerified = answer.trim().toUpperCase().includes("YES");

    if (!isVerified) {
      console.log("❌ Verification Failed by AI");
      return res.status(400).json({
        success: false,
        message:
          "AI could not verify the objective based on the photo provided.",
      });
    }

    console.log("✅ AI Approved. Signing transaction...");

    const tx = await contract.verifySuccess(challengeId, { gasLimit: 200000 });
    console.log(`🚀 Transaction Sent: ${tx.hash}`);

    await tx.wait();
    console.log("🔗 Confirmed on-chain.");

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("Server Error:", error.message);

    // Categorize errors and return appropriate responses without leaking internals
    if (error.message === "AI verification timeout") {
      return res.status(504).json({
        success: false,
        message: "AI verification timed out. Please try again.",
      });
    }

    if (error.code === "CALL_EXCEPTION") {
      return res.status(400).json({
        success: false,
        message: "Challenge may already be verified or does not exist.",
      });
    }

    if (error.message?.includes("rate limit")) {
      return res.status(429).json({
        success: false,
        message: "AI service rate limited. Please try again in a few seconds.",
      });
    }

    if (error.response) {
      console.error("API Error Details:", error.response.data);
    }

    res.status(500).json({
      success: false,
      message: "Verification process failed. Please try again.",
    });
  }
});

// ===== START SERVER =====
const server = app.listen(PORT, () => {
  console.log(`\n🟢 Verifier Server running at http://localhost:${PORT}`);
  console.log(`   - Target Contract: ${CONTRACT_ADDRESS}`);
  console.log(`   - Allowed Origins: ${allowedOrigins.join(", ")}`);
});

// ===== GRACEFUL SHUTDOWN =====
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("✅ Server closed.");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error("⚠️ Forcing shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
