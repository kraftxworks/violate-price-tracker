// scripts/import-excel.js
// One-time importer: reads data/violate_goals_tracker.xlsx → Supabase goals table
//
// Usage:
//   SUPABASE_SERVICE_KEY=<your-service-role-key> USER_ID=<your-user-uuid> node scripts/import-excel.js
//
// Get SERVICE_KEY: Supabase dashboard → Project Settings → API → service_role
// Get USER_ID:     Supabase dashboard → Authentication → Users → copy your user UUID

const XLSX      = require('xlsx');
const path      = require('path');
const fetch     = (...a) => import('node-fetch').then(m => m.default(...a));

const SUPABASE_URL  = process.env.SUPABASE_URL || 'https://cqlyqyuvinhlyyqwbcdt.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const USER_ID       = process.env.USER_ID;

if (!SERVICE_KEY) { console.error('❌  SUPABASE_SERVICE_KEY env var required'); process.exit(1); }
if (!USER_ID)     { console.error('❌  USER_ID env var required'); process.exit(1); }

const HORIZON_MAP = {
  '0-1Y':  'Now',
  '0-3Y':  'Soon',
  '1-3Y':  'Soon',
  '3-5Y':  'Mid',
  '3-10Y': 'Long',
  '5-10Y': 'Long',
  '10Y+':  'Vision',
  '—':     'Soon',
  '':      'Soon',
};

const XLSX_PATH = path.join(__dirname, '..', 'data', 'violate_goals_tracker.xlsx');
const wb   = XLSX.readFile(XLSX_PATH);
const ws   = wb.Sheets['Master'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

console.log(`📋  Found ${rows.length} rows in Master sheet`);

const goals = rows.map(row => ({
  user_id:      USER_ID,
  goal_id:      row.ID        || null,
  query:        row.Goal      || '',
  notes:        row['Source / Notes'] || null,
  _v:           2,
  type:         row.Type      || 'Do',
  vertical:     row.Vertical  || 'Experiences',
  subcategory:  row.Subcategory || null,
  status:       row.Status    || 'Idea',
  horizon:      HORIZON_MAP[row['Time Horizon']] || 'Soon',
  cost_estimate: row['Cost (INR)'] || null,
  ai_help_note:  row['How AI Helps'] || null,
  ai:           null,
  sources:      null,
  steps:        null,
})).filter(g => g.query.trim());

async function insertBatch(batch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/goals`, {
    method: 'POST',
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(batch),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Insert failed ${r.status}: ${txt}`);
  }
}

async function run() {
  const BATCH_SIZE = 50;
  let inserted = 0;
  console.log(`🚀  Inserting ${goals.length} goals for user ${USER_ID}…\n`);

  for (let i = 0; i < goals.length; i += BATCH_SIZE) {
    const batch = goals.slice(i, i + BATCH_SIZE);
    await insertBatch(batch);
    inserted += batch.length;
    console.log(`  ✓  ${inserted} / ${goals.length}`);
  }

  console.log(`\n✅  Done! ${inserted} goals imported.`);
  console.log(`\nNext: open https://violate-price-tracker.vercel.app and sign in to see your goals.`);
}

run().catch(e => { console.error('❌ ', e.message); process.exit(1); });
