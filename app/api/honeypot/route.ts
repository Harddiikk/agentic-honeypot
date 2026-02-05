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
    console.error(`[Honeypot Auth] API_KEY environment variable is MISSING or EMPTY.`);
    return false;
  }

  if (apiKey !== validApiKey) {
    console.error(`[Honeypot Auth] Key Mismatch. Received: '${apiKey ? '***' + apiKey.slice(-4) : 'null'}', Expected: '***' + ${validApiKey.slice(-4)}`);
    return false;
  }

  console.log(`[Honeypot Auth] Success.`);
  return true;
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
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401, headers: getCorsHeaders() }
    );
  }
  return NextResponse.json(
    {
      status: "success",
      message: "Agentic Honeypot API is running",
      version: "1.0.0"
    },
    { status: 200, headers: getCorsHeaders() }
  );
}

// POST handler - STRICT IMPLEMENTATION
export async function POST(req: Request) {
  try {
    // 1. API Key Authentication
    if (!validateApiKey(req)) {
      return NextResponse.json(
        { status: "error", message: "Unauthorized - Invalid or missing API key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Strict Input Parsing
    const body = await req.json();
    const { sessionId, message, conversationHistory = [], metadata = {} } = body;

    if (!sessionId || !message || !message.text) {
      return NextResponse.json(
        { status: "error", message: "Invalid input format. Required: sessionId, message.text" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const incomingText = message.text;
    const currentTurnCount = (conversationHistory?.length || 0) + 1;

    // 3. Context Retrieval (Mem0)
    // Using sessionId as user_id for isolation
    const memoriesData = (await mem0.search("scam context", {
      user_id: sessionId,
      filters: { user_id: sessionId }
    })) as { results?: any[] } | any[];

    const memories = Array.isArray(memoriesData) ? memoriesData : (memoriesData.results || []);
    const relevantContext = memories
      .map((m: any) => typeof m === 'string' ? m : (m.memory || JSON.stringify(m)))
      .join("\n");

    // 4. AI Logic (Scam Detection & Engagement)
    const systemPrompt = `
You are an autonomous scam-honeypot AI agent.
**Persona**: Rakesh Sharma (46, Male), Shop Owner from Indore.
**Personality**: Polite, slightly anxious about finances, respects authority, not tech-savvy.
**Bait Info**: SBI A/C: 502134789012, IFSC: SBIN0004578, UPI: rakesh.sharma46@oksbi.

**OBJECTIVE**:
1. Check if the incoming message is a SCAM.
2. If SCAM: Engage to extract entities (Bank A/C, UPI, Links, Phones). Keep them talking.
3. If NOT SCAM: Reply normally.
4. **Conclusion**: If you have CONFIRMED it is a scam AND (you have extracted 2+ entities OR conversation > 5 turns), set "is_finished": true.

**STRICT JSON OUTPUT**:
{
  "is_scam": boolean,
  "reply": "Your response string",
  "extracted_intelligence": {
    "bankAccounts": [],
    "upiIds": [],
    "phishingLinks": [],
    "phoneNumbers": [],
    "suspiciousKeywords": []
  },
  "is_finished": boolean,
  "agentNotes": "Brief summary",
  "detected_tactic": "Urgency|Fear|Greed|Authority|None", 
  "safeguard_tip": "Tip for users" 
}

INPUT:
Message: "${incomingText}"
History Summary: ${relevantContext.slice(0, 300)}
Metadata: ${JSON.stringify(metadata)}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" }
    });

    const aiResult = JSON.parse(completion.choices[0].message.content || "{}");

    // 5. Intelligence Aggregation (AI + Regex)
    const regexExtracted = extractEntitiesRegex(incomingText + " " + aiResult.reply);
    const finalIntelligence = {
      bankAccounts: Array.from(new Set([...(aiResult.extracted_intelligence?.bankAccounts || []), ...regexExtracted.bankAccounts])),
      upiIds: Array.from(new Set([...(aiResult.extracted_intelligence?.upiIds || []), ...regexExtracted.upiIds])),
      phishingLinks: Array.from(new Set([...(aiResult.extracted_intelligence?.phishingLinks || []), ...regexExtracted.phishingLinks])),
      phoneNumbers: Array.from(new Set([...(aiResult.extracted_intelligence?.phoneNumbers || []), ...regexExtracted.phoneNumbers])),
      suspiciousKeywords: aiResult.extracted_intelligence?.suspiciousKeywords || []
    };

    // 6. Persistence (Mem0)
    if (aiResult.is_scam) {
      await mem0.add([
        { role: "user", content: incomingText },
        { role: "assistant", content: `Reply: ${aiResult.reply}. Intelligence: ${JSON.stringify(finalIntelligence)}` }
      ], { user_id: sessionId, metadata: { type: "engagement", turn: currentTurnCount } });
    }

    // 7. MANDATORY CALLBACK (If finished)
    if (aiResult.is_scam && aiResult.is_finished) {
      const callbackPayload = {
        sessionId: sessionId,
        scamDetected: true,
        totalMessagesExchanged: currentTurnCount,
        extractedIntelligence: finalIntelligence,
        agentNotes: aiResult.agentNotes || "Scam detected and engagement completed."
      };

      console.log(`[Honeypot] Triggering Callback for ${sessionId}`);

      // Fire-and-forget
      fetch(process.env.GUVI_CALLBACK_URL || "https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callbackPayload)
      }).catch(err => console.error("[Callback Error]", err));
    }

    // 8. Strict Response Format matches Problem Statement
    // Also including extra fields for Frontend UI, but valid JSON is valid JSON.
    return NextResponse.json(
      {
        status: "success",
        reply: aiResult.reply,
        // Optional fields for our Frontend Dashboard (not part of problem spec but useful)
        scam_detected: aiResult.is_scam,
        reason: aiResult.agentNotes,
        detected_tactic: aiResult.detected_tactic,
        safeguard_tip: aiResult.safeguard_tip,
        extracted_entities: {
          // Map back to snake_case for frontend compatibility if needed, 
          // OR update frontend to use camelCase. Let's keep snake_case for frontend for now.
          bank_accounts: finalIntelligence.bankAccounts,
          upi_ids: finalIntelligence.upiIds,
          urls: finalIntelligence.phishingLinks,
          ifsc_codes: [],
          phone_numbers: finalIntelligence.phoneNumbers
        }
      },
      { status: 200, headers: getCorsHeaders() }
    );

  } catch (error: any) {
    console.error("[Honeypot] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
