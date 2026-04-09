# Phase 1 Setup Guide
## Defending Country Intel — Getting to a Running MVP

**Time to complete:** ~2-3 hours  
**Prerequisites:** Node.js 18+, Wrangler CLI, Supabase account, Cloudflare account (kadomuir)

---

## Step 1: Create the Supabase Project

1. Go to https://supabase.com/dashboard/projects
2. Click **New Project** under your Dilji Labs organisation
3. Name: `defending-country-intel`
4. Database password: generate a strong one and save it
5. Region: **Sydney (ap-southeast-2)** — closest to Goldfields WA
6. **CRITICAL:** Do NOT use any of the existing projects:
   - ❌ kbkkvkqinaewnhudgtat (Djunpin)
   - ❌ ovkfrrrmeoeivvuvryjv (Ninti:la)
   - ❌ nhkpdlvxqtbkammdxuir (Dilji CRM)

---

## Step 2: Enable PostGIS

In the Supabase dashboard for your new project:

1. Go to **Database → Extensions**
2. Search for `postgis`
3. Click **Enable**

PostGIS must be enabled BEFORE running migrations.

---

## Step 3: Run Database Migrations

In Supabase SQL Editor, run the migrations in order:

```
supabase/migrations/001_schema.sql   ← Core tables + PostGIS
supabase/migrations/002_rls.sql      ← Row Level Security
supabase/migrations/003_triggers.sql ← Deadline engine + alerts
```

Run each file completely before moving to the next.  
Check for errors after each migration.

---

## Step 4: Get Your Supabase Keys

From Supabase Dashboard → **Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL` and `SUPABASE_URL`
- **anon/public key** → `VITE_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (Worker only — never expose to frontend)

---

## Step 5: Set Up the Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Step 6: Create Your First PBC (Test Data)

In Supabase SQL Editor, insert a test PBC:

```sql
-- Insert a test PBC (replace with real determination details)
INSERT INTO pbcs (name, determination_id, tier)
VALUES (
  'Test PBC — Goldfields',
  'WCD2024/001',  -- Replace with real NNTT determination ID
  'defender'
);
```

To add the determination boundary geometry, you'll need the GeoJSON from:
https://data-nntt.opendata.arcgis.com/ → Native Title Determinations layer

---

## Step 7: Create a Test Staff Account

1. In Supabase Dashboard → **Authentication → Users**
2. Click **Add user** → **Create new user**
3. Enter email and password for the PBC admin
4. Note the user UUID

Then link them to the PBC in SQL:

```sql
INSERT INTO staff (user_id, pbc_id, role)
VALUES (
  'USER_UUID_FROM_AUTH',
  (SELECT id FROM pbcs WHERE determination_id = 'WCD2024/001'),
  'admin'
);
```

---

## Step 8: Deploy the Cloudflare Worker

```bash
cd worker
npm install -g wrangler

# Authenticate with your kadomuir Cloudflare account
wrangler login

# Set secrets (do NOT put real values in wrangler.toml)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ADMIN_TOKEN

# Test locally first
wrangler dev

# Deploy to production
wrangler deploy
```

---

## Step 9: Generate VAPID Keys for Push Notifications

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Copy the output:
- **Public key** → `VITE_VAPID_PUBLIC_KEY` in frontend `.env.local`
- **Private key** → `wrangler secret put VAPID_PRIVATE_KEY`
- **Public key** → `wrangler secret put VAPID_PUBLIC_KEY`

---

## Step 10: Deploy the Frontend to Cloudflare Pages

```bash
cd frontend
npm run build

# In Cloudflare Dashboard → Pages → Create application
# Connect to GitHub repo: kadomuir-collab/defending-country-intel
# Build command: npm run build
# Build output directory: dist
# Root directory: frontend
```

Set environment variables in Cloudflare Pages:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY`

---

## Step 11: Test the Full Flow

1. Log into the app at your Cloudflare Pages URL
2. You should see the Watchtower screen with no notices
3. Manually trigger the NNTT ingestion:
   ```
   curl -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
     https://dci-ingestion-worker.YOUR_ACCOUNT.workers.dev/trigger/nntt
   ```
4. Check Supabase `notices` table for ingested records
5. Verify deadline dates are calculated correctly (notification_date + 4 months)
6. Confirm notices appear in the Watchtower screen

---

## Phase 1 Complete Checklist

- [ ] Supabase project created (isolated, not shared)
- [ ] PostGIS extension enabled
- [ ] All 3 migrations run without errors
- [ ] At least one PBC registered with boundary geometry
- [ ] At least one staff account created and linked
- [ ] Frontend running locally and showing Watchtower
- [ ] Worker deployed with correct secrets
- [ ] NNTT ingestion tested — notices appearing in DB
- [ ] Deadline dates calculating correctly
- [ ] Frontend deployed to Cloudflare Pages
- [ ] Push notifications tested on iOS Safari (requires installed PWA)

---

## What's Next — Phase 2

After Phase 1 is stable and tested with one real PBC:

- MapLibre GL integration (Country Map screen)
- DMIRS tenement polygon overlay
- Heritage register data entry form
- Spatial crosscheck logic (tenement ∩ heritage sites)
- Risk rating display

See README.md for full Phase 2 build sequence.

---

## Troubleshooting

**"No notices appearing after NNTT trigger"**  
→ Check the PBC has a `boundary` geometry set in Supabase  
→ NNTT query uses spatial intersection — no boundary = no results  
→ Check Worker logs in Cloudflare Dashboard → Workers → Logs

**"RLS blocking queries"**  
→ Verify staff record exists for the logged-in user  
→ Check `pbc_id` matches between `staff` and `notices` tables  
→ Test with service_role key in Supabase SQL Editor to confirm data exists

**"Deadline date wrong"**  
→ Confirm `notification_date` was extracted correctly from NNTT data  
→ Check 003_triggers.sql migration ran — the `calculate_deadline` trigger  
→ Deadline = notification_date + INTERVAL '4 months' (PostgreSQL calendar months)

**"Push notifications not working on iOS"**  
→ PWA must be installed to home screen (Add to Home Screen)  
→ iOS requires full PWA install for Web Push — browser-only does not work  
→ Check manifest.json is served correctly  
→ VAPID keys must be set in both Worker secrets and frontend env vars
