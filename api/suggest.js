// Vercel Serverless Function — POST /api/suggest
// Body: { query: string, notes?: string }
// Returns: { name, category, priceRange:{min,max,currency}, alternateQueries:[], bestVendors:[], reasoning }
//
// Uses Google Gemini (free tier). Set GEMINI_API_KEY in Vercel env.
// Falls back to GROQ_API_KEY (Groq Llama 3.3 70B) if Gemini key is missing.

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a shopping research assistant for buyers in India. Given a rough product description from a user's wishlist, return a strict JSON object only (no markdown, no prose) with this shape:

{
  "name": "cleaned product name (2 to 8 words, optimised for marketplace search)",
  "category": "one of: Fashion, Footwear, Accessories, Electronics, Home, Beauty, Books, Sports, Other",
  "priceRange": { "min": <number INR>, "max": <number INR>, "currency": "INR" },
  "alternateQueries": ["2 to 4 alternative search phrases that may surface better results"],
  "bestVendors": ["ranked list of 3 to 6 from: Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa Fashion"],
  "reasoning": "one short sentence on why these vendors fit"
}

Rules:
- Use realistic Indian market prices in INR.
- For fashion/streetwear lean Myntra, Ajio, Meesho, Amazon. For electronics lean Amazon, Flipkart. For beauty lean Nykaa Fashion, Amazon.
- Never include URLs in the output. The frontend builds search URLs from the cleaned name.
- Output VALID JSON only. No backticks, no triple-backtick json, no commentary.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const query = (body && body.query ? String(body.query) : "").trim();
  const notes = (body && body.notes ? String(body.notes) : "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });

  const userPrompt = notes
    ? `Wishlist item: ${query}\nUser notes: ${notes}`
    : `Wishlist item: ${query}`;

  try {
    let result;
    if (process.env.GEMINI_API_KEY) {
      try {
        result = await callGemini(userPrompt);
      } catch (geminiErr) {
        console.warn("Gemini failed, trying Groq fallback:", geminiErr.message);
        if (process.env.GROQ_API_KEY) {
          result = await callGroq(userPrompt);
        } else {
          throw geminiErr;
        }
      }
    } else if (process.env.GROQ_API_KEY) {
      result = await callGroq(userPrompt);
    } else {
      return res.status(500).json({ error: "No AI key configured. Set GEMINI_API_KEY or GROQ_API_KEY." });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("suggest error:", err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}

async function callGemini(userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json"
    }
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return safeParse(text);
}

async function callGroq(userPrompt) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  return safeParse(text);
}

function safeParse(text) {
  try {
    const obj = JSON.parse(text);
    return normalize(obj);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return normalize(JSON.parse(m[0])); } catch {}
    }
    return normalize({});
  }
}

function normalize(obj) {
  return {
    name: obj.name || "",
    category: obj.category || "Other",
    priceRange: {
      min: Number(obj?.priceRange?.min) || 0,
      max: Number(obj?.priceRange?.max) || 0,
      currency: "INR"
    },
    alternateQueries: Array.isArray(obj.alternateQueries) ? obj.alternateQueries.slice(0, 5) : [],
    bestVendors: Array.isArray(obj.bestVendors) ? obj.bestVendors.slice(0, 6) : [],
    reasoning: obj.reasoning || ""
  };
}
