# Defending Country Intel
## Section 29 Intelligence & Heritage Response Platform for PBCs

**Dilji Labs / Kado Muir — Confidential**  
April 2026

---

### What this is

A mobile-first PWA that gives Prescribed Body Corporates (PBCs) real-time intelligence about section 29 notices affecting their Country — and the tools to respond before deadlines expire.

The mining industry has Detector Maps and Trilobite. PBCs now have this.

---

### Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (PWA) |
| Deployment | Cloudflare Pages |
| API / Ingestion | Cloudflare Workers (cron + HTTP) |
| Database | Supabase + PostGIS |
| Maps | MapLibre GL |
| Push Notifications | Web Push API |
| Auth | Supabase Auth |
| PDF Generation | pdf-lib (Form 4 pre-population) |

---

### Supabase Project

**Dedicated project** — do NOT share with:
- `kbkkvkqinaewnhudgtat` (Djunpin)
- `ovkfrrrmeoeivvuvryjv` (Ninti:la)
- `nhkpdlvxqtbkammdxuir` (Dilji CRM)

Heritage data requires its own isolated RLS environment.

---

### Repo Structure

```
defending-country-intel/
├── frontend/                    # React/Vite PWA
│   ├── public/                  # manifest.json, icons, service worker
│   └── src/
│       ├── components/
│       │   ├── Watchtower/      # Notice list + deadline cards
│       │   ├── Map/             # MapLibre GL country map
│       │   ├── Heritage/        # Sovereign heritage register
│       │   ├── Respond/         # Response toolkit + Form 4
│       │   └── shared/          # Nav, auth, UI primitives
│       ├── pages/               # Route-level page components
│       ├── hooks/               # useNotices, useDeadline, useHeritage
│       ├── lib/                 # supabase client, deadline logic, push
│       └── styles/              # Global CSS + design tokens
├── worker/                      # Cloudflare Worker
│   └── src/
│       ├── index.js             # Cron entry point
│       ├── ingest-nntt.js       # NNTT ArcGIS REST ingestion
│       ├── ingest-dmirs.js      # DMIRS tenement ingestion
│       ├── ingest-gazette.js    # WA Gazette PDF parse
│       └── deadline.js          # Deadline calculation utilities
└── supabase/
    ├── migrations/              # SQL migrations (run in order)
    │   ├── 001_schema.sql       # Core tables + PostGIS
    │   ├── 002_rls.sql          # Row Level Security policies
    │   └── 003_triggers.sql     # Deadline calc + push triggers
    └── functions/               # Supabase Edge Functions (if needed)
```

---

### Build Sequence

**Phase 1 — Foundation (Weeks 1–4)**
- [ ] Supabase project setup + schema migration
- [ ] RLS policies (001, 002, 003 migrations)
- [ ] Cloudflare Worker — NNTT ingestion cron
- [ ] Deadline calculation on notice insert
- [ ] React/Vite PWA scaffold — auth + Watchtower screen
- [ ] Web Push notification on new notice

**Phase 2 — Map & Crosscheck (Weeks 5–8)**
- [ ] MapLibre GL — PBC determination boundary
- [ ] DMIRS tenement polygon overlay
- [ ] Heritage register data entry form
- [ ] Spatial crosscheck (tenement ∩ heritage sites)
- [ ] Risk rating on notice panel + map

**Phase 3 — Response & Hardening (Weeks 9–12)**
- [ ] Response Toolkit — pathway logic
- [ ] Form 4 pre-population (pdf-lib)
- [ ] Offline mode — service worker + tile cache
- [ ] DMIRS + WA Gazette ingestion
- [ ] Pilot PBC onboarding (one PBC, real Country data)
- [ ] RLS audit + penetration test

---

### Critical Design Principles

1. **The PBC is the customer and the data owner.** Dilji Labs is the service provider.
2. **The deadline engine is the most critical feature.** A missed four-month deadline cannot be recovered.
3. **The heritage register must never ask WHY a site is significant.** Only THAT it is significant. (Top End 2025)
4. **Unsurveyed ≠ Safe.** UNKNOWN risk is not LOW risk. This distinction must be unambiguous in the UI.
5. **Every consequential action requires a human to confirm.** The platform does not lodge objections automatically.
6. **Build for the phone.** PBC staff are in the field, in remote locations, with variable connectivity.
7. **Build the architecture to adapt.** The ALRC may abolish the expedited procedure. The underlying problem doesn't go away.

---

### Legal Reference

- Native Title Act 1993 (Cth) — s29, s32, s35, s237
- *Top End (Default PBC/CLA) Aboriginal Corporation v Northern Territory* [2025] FCA 22
- ALRC Future Acts Regime Final Report (due March 2026 — monitor for reform)
