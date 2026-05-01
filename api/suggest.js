// Vercel Serverless Function — POST /api/suggest
// Body: { query: string, notes?: string }
// Returns: { name, category, priceRange:{min,max,currency}, alternateQueries:[], bestVendors:[], reasoning }
//
// Uses Google Gemini (free tier). Set GEMINI_API_KEY in Vercel env.
// Falls back to GROQ_API_KEY (Groq Llama 3.3 70B) if Gemini key is missing.

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a goals and lifestyle research assistant for ambitious people in India. Given a goal or wish from a user's bucket list, return a strict JSON object only (no markdown, no prose) with this shape:

{
  "name": "cleaned 2-8 word title optimised for search or clarity",
  "inferredType": "most likely goal type — one of: Buy|Do|Learn|Meet|Build|Achieve|Visit|Routine|Earn|Review",
  "inferredVertical": "most likely life vertical — one of: Creator|Possessions|Experiences|Skills|People|Businesses|Properties|Memberships|Health|Education|Career|Financial|Daily OS|Edge",
  "inferredHorizon": "realistic timeframe — one of: Now|Soon|Mid|Long|Vision",
  "aiHelpNote": "one punchy sentence on exactly how AI can help achieve this — be specific and useful",
  "category": "legacy field — one of: Fashion|Footwear|Accessories|Electronics|Audio & Video|Home & Living|Beauty & Grooming|Books & Stationery|Sports & Fitness|Food & Dining|Wines & Spirits|Travel & Experiences|Music & Entertainment|Gaming|Jewellery|Health & Wellness|Automotive|Other",
  "priceRange": { "min": <number INR>, "max": <number INR>, "currency": "INR" },
  "alternateQueries": ["2-4 search phrases that surface better results — only relevant for Buy type"],
  "bestVendors": ["ranked 3-6 from: Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa Fashion — only relevant for Buy type, else empty array"],
  "reasoning": "one sentence on vendor fit or goal strategy"
}

Type rules:
- Buy: owning a physical or financial asset (watch, car, diamond, crypto, gadget, jewellery)
- Do: one-time experience (skydiving, tank driving, travel event, shoot, collab)
- Learn: acquiring a skill or knowledge (course, certification, mentor, practice, training)
- Meet: connecting with a specific person (intro, network, mentor meeting, coffee)
- Build: creating something from scratch (startup, product, app, content system, fund)
- Achieve: hitting a milestone or credential (follower count, award, exam score, rank)
- Visit: going to a specific place (country, city, landmark, restaurant, monument)
- Routine: recurring habit or daily practice (meditation, workout, journaling, sleep)
- Earn: generating income or returns (revenue target, investment return, salary milestone)
- Review: periodic assessment (quarterly review, portfolio rebalance, audit)

Horizon rules: Now = 0-1Y urgent goal; Soon = 1-3Y near-term; Mid = 3-5Y; Long = 5-10Y; Vision = 10Y+ aspiration.
Vertical rules: physical possessions → Possessions; one-time experiences/adventures → Experiences; skills/knowledge → Skills; people/relationships → People; business/venture → Businesses; real estate → Properties; clubs/access → Memberships; body/wellness → Health; formal education → Education; job/role → Career; money/investments → Financial; daily systems → Daily OS; strategic advantages → Edge; content/audience → Creator.

Price: realistic Indian market estimate in INR. For experiences/services, estimate the total cost.
For non-Buy types: bestVendors = [], alternateQueries = [].
Output VALID JSON only. No backticks, no commentary.`;

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
    name:             obj.name             || "",
    inferredType:     obj.inferredType     || "Do",
    inferredVertical: obj.inferredVertical || "Experiences",
    inferredHorizon:  obj.inferredHorizon  || "Soon",
    aiHelpNote:       obj.aiHelpNote       || "",
    category:         obj.category         || "Other",
    priceRange: {
      min: Number(obj?.priceRange?.min) || 0,
      max: Number(obj?.priceRange?.max) || 0,
      currency: "INR"
    },
    alternateQueries: Array.isArray(obj.alternateQueries) ? obj.alternateQueries.slice(0, 5) : [],
    bestVendors:      Array.isArray(obj.bestVendors)      ? obj.bestVendors.slice(0, 6)      : [],
    reasoning:        obj.reasoning        || ""
  };
}
