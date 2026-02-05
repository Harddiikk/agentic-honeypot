import { OpenAI } from "openai";
import { MemoryClient } from "mem0ai";
import { NextResponse } from "next/server";
import { PERSONAS } from "@/lib/personas";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY!,
});

// Helper for regex-based extraction
function extractEntitiesRegex(text: string) {
  return {
    upiIds: text.match(/\b[\w.-]+@[\w.-]+\b/g) || [],
    phishingLinks: text.match(/https?:\/\/[^\s]+/g) || [],
    bankAccounts: text.match(/\b\d{9,18}\b/g) || [],
    phoneNumbers: text.match(/\b(?:\+91|0)?[6-9]\d{9}\b/g) || [], // Indian mobile numbers
  };
}

// CORS headers helper
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  };
}

// API Key validation middleware
function validateApiKey(req: Request): boolean {
  const apiKey = req.headers.get("x-api-key");
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    console.error("[Honeypot] API_KEY environment variable not set");
    return false;
  }

  return apiKey === validApiKey;
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(req: Request) {
  return NextResponse.json({}, {
    status: 200,
    headers: getCorsHeaders()
  });
}

// GET handler
export async function GET(req: Request) {
  // Validate API key
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized - Invalid or missing API key" },
      {
        status: 401,
        headers: getCorsHeaders()
      }
    );
  }

  // Return success response for GET requests
  return NextResponse.json(
    {
      status: "success",
      message: "Honeypot API is running",
      endpoints: {
        POST: "/api/honeypot - Send scam messages for detection",
        GET: "/api/honeypot - Check API status"
      },
      version: "1.0.0"
    },
    {
      status: 200,
      headers: getCorsHeaders()
    }
  );
}

// POST handler
export async function POST(req: Request) {
  try {
    // 1. API Key Authentication
    if (!validateApiKey(req)) {
      return NextResponse.json(
        { status: "error", message: "Unauthorized - Invalid or missing API key" },
        {
          status: 401,
          headers: getCorsHeaders()
        }
      );
    }

    // 2. Parse Request
    const body = await req.json();
    const { sessionId, message, conversationHistory = [], metadata = {} } = body;

    if (!message || !message.text) {
      return NextResponse.json(
        { status: "error", message: "Missing message text" },
        {
          status: 400,
          headers: getCorsHeaders()
        }
      );
    }

    const incomingText = message.text;
    const sender = message.sender;

    // 3. Search Mem0 for session context
    const memoriesData = (await mem0.search("scam intelligence", {
      user_id: sessionId,
      filters: { user_id: sessionId }
    })) as { results?: any[] } | any[];

    const memories = Array.isArray(memoriesData) ? memoriesData : (memoriesData.results || []);
    const memoryContext = memories
      .map((m: any) => typeof m === 'string' ? m : (m.memory || JSON.stringify(m)))
      .join("\n");

    // Default persona (Rakesh Sharma)
    const selectedPersona = PERSONAS[1] || PERSONAS[0];

    // 4. AI-powered Scam Detection and Engagement
    const systemPrompt = `
You are an autonomous scam-honeypot AI adopting the persona of **Rakesh Sharma** (Age 46) from Indore.

### YOUR IDENTITY:
- **Occupation**: Small electronics shop owner.
- **Traits**: Polite, slightly anxious, trusts authority, uses simple language.
- **Banking Info (Bait)**: SBI Palasia (A/C: 502134789012, IFSC: SBIN0004578, UPI: rakesh.sharma46@oksbi).

### GOAL:
1. Detect if the message is a SCAM.
2. If it is a scam, engage the sender to extract: bank accounts, UPI IDs, links, phone numbers, and suspicious keywords.
3. If not a scam, respond naturally in persona.
4. **Engagement Lifecycle**: After 3-5 turns of engagement OR if you've extracted significant intelligence, set "is_finished" to true.

### OUTPUT FORMAT (STRICT JSON ONLY):
{
  "is_scam": boolean,
  "justification": "Why you think it is a scam (short string)",
  "reply": "Your response as Rakesh",
  "extracted_intelligence": {
    "bankAccounts": ["list of strings"],
    "upiIds": ["list of strings"],
    "phishingLinks": ["list of strings"],
    "phoneNumbers": ["list of strings"]
  },
  "detected_tactic": "Urgency|Fear|Greed|Authority|None",
  "safeguard_tip": "One short tip for users against this tactic",
  "is_finished": boolean,
  "agentNotes": "Summary of behavioral patterns"
}

Current Message: "${incomingText}"
Channel: ${metadata.channel || "Unknown"}
History Summary: ${memoryContext.slice(0, 500) || "Start of conversation"}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    // Supplement with Regex extraction
    const regexExtracted = extractEntitiesRegex(incomingText + " " + result.reply);
    const finalExtracted = {
      bank_accounts: Array.from(new Set([...(result.extracted_intelligence?.bankAccounts || []), ...regexExtracted.bankAccounts])),
      upi_ids: Array.from(new Set([...(result.extracted_intelligence?.upiIds || []), ...regexExtracted.upiIds])),
      urls: Array.from(new Set([...(result.extracted_intelligence?.phishingLinks || []), ...regexExtracted.phishingLinks])),
      ifsc_codes: [], // Extracted if possible, regex doesn't support specific ifsc yet
      phone_numbers: Array.from(new Set([...(result.extracted_intelligence?.phoneNumbers || []), ...regexExtracted.phoneNumbers])),
    };

    // 5. Update Mem0 with Intelligence and Metadata
    if (result.is_scam) {
      await mem0.add([
        { role: "user", content: incomingText },
        {
          role: "assistant",
          content: `Intelligence: ${JSON.stringify(finalExtracted)}. Finished: ${result.is_finished}. Notes: ${result.agentNotes}`
        }
      ], { user_id: sessionId, metadata: { type: "scam_engagement", turnCount: conversationHistory.length + 1 } });
    }

    // 6. Callback Check (Mandatory Result Callback)
    if (result.is_scam && result.is_finished) {
      const callbackPayload = {
        sessionId: sessionId,
        scamDetected: true,
        totalMessagesExchanged: conversationHistory.length + 1,
        extractedIntelligence: finalExtracted,
        agentNotes: result.agentNotes || "Automatic detection and engagement complete."
      };

      console.log(`[Honeypot] Triggering Callback for ${sessionId}`);

      // Fire-and-forget callback to avoid blocking response
      fetch(process.env.GUVI_CALLBACK_URL || "https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callbackPayload)
      }).catch(err => console.error("[Honeypot] Callback Error:", err));
    }

    // 7. Return Response (Hackathon Format + Frontend Extra Data)
    return NextResponse.json(
      {
        status: "success",
        reply: result.reply || "I am sorry, I didn't understand that.",
        scam_detected: result.is_scam,
        reason: result.justification,
        detected_tactic: result.detected_tactic,
        safeguard_tip: result.safeguard_tip,
        extracted_entities: finalExtracted
      },
      {
        status: 200,
        headers: getCorsHeaders()
      }
    );

  } catch (error: any) {
    console.error("[Honeypot] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}
