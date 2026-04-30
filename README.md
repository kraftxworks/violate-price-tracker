# Violate Price Tracker

Live wishlist + AI vendor finder. Frontend is a single HTML file. One serverless function proxies an AI call. Storage is Supabase.

## Setup (15 min)

### 1. Get a free Gemini key
Open https://aistudio.google.com/apikey, sign in, click "Create API key". Copy it.

(Alternative: Groq at https://console.groq.com if you want faster latency. Use `GROQ_API_KEY` instead.)

### 2. Create a Supabase project
1. Go to https://supabase.com, create a free project.
2. Open SQL Editor, paste `supabase-schema.sql`, run.
3. From Project Settings → API, copy:
   - Project URL
   - `anon` public key

### 3. Wire the frontend
Open `index.html`, find `SUPABASE_CONFIG`, paste your URL and anon key.

### 4. Deploy to Vercel
```
npm i -g vercel
cd violate-price-tracker
vercel
```
Then in the Vercel dashboard → Project → Settings → Environment Variables, add:
- `GEMINI_API_KEY` = your Gemini key

Redeploy: `vercel --prod`.

That's it. Visit your URL.

## How it works

- User adds an item → calls `/api/suggest`.
- The function asks Gemini for a cleaned name, category, INR price range, and ranked vendors.
- The frontend builds search URLs for Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa Fashion using the cleaned name.
- Item is saved in Supabase keyed by an anonymous device id stored in localStorage.

No vendor scraping. No paid APIs. Free tier covers thousands of users.

## Files

```
violate-price-tracker/
├── index.html              # frontend (Violate brand styling)
├── api/
│   └── suggest.js          # Vercel function → Gemini (or Groq fallback)
├── supabase-schema.sql     # one-time DB setup
├── vercel.json
├── package.json
└── README.md
```

## Env vars
- `GEMINI_API_KEY` — required (or `GROQ_API_KEY` as fallback)

Frontend uses no env vars. Supabase URL and anon key are baked into `index.html`. The anon key is safe to expose because RLS policies only allow access by device_id.

## Local dev
```
vercel dev
```
Runs on http://localhost:3000.
