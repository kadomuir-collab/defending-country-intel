-- ============================================================
-- 001_schema.sql
-- Defending Country Intel — Core Schema
-- Dilji Labs / Kado Muir — April 2026
--
-- Run in Supabase SQL editor AFTER enabling PostGIS extension.
-- Enable PostGIS first: Extensions > postgis > Enable
-- ============================================================

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- PBCs — Registered Prescribed Body Corporates
-- ============================================================
CREATE TABLE pbcs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  determination_id    TEXT NOT NULL UNIQUE,  -- NNTT determination number
  boundary            GEOMETRY(MULTIPOLYGON, 4326),  -- PostGIS determination area
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  ntrb                TEXT,  -- e.g. 'Goldfields Land and Sea Council'
  tier                TEXT NOT NULL DEFAULT 'defender'
                        CHECK (tier IN ('watchtower', 'defender', 'pro', 'ntrb')),
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index on PBC boundaries
CREATE INDEX pbcs_boundary_idx ON pbcs USING GIST (boundary);

-- ============================================================
-- NOTICES — Ingested Section 29 Notices
-- ============================================================
CREATE TABLE notices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,

  -- Tenement details (from NNTT / DMIRS)
  tenement_number     TEXT NOT NULL,
  tenement_type       TEXT NOT NULL,  -- EL, PL, ML, ML etc.
  grantee             TEXT,
  government_party    TEXT,
  source              TEXT NOT NULL CHECK (source IN ('nntt', 'dmirs', 'gazette')),
  source_id           TEXT,  -- Original ID from source system
  notice_url          TEXT,

  -- Critical dates
  notification_date   DATE NOT NULL,
  deadline_date       DATE NOT NULL,  -- notification_date + 4 months (calculated on insert)

  -- Spatial
  geometry            GEOMETRY(GEOMETRY, 4326),  -- Tenement boundary polygon

  -- Status
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'objection_lodged', 'expired', 'withdrawn', 'monitored')),
  deadline_status     TEXT NOT NULL DEFAULT 'green'
                        CHECK (deadline_status IN ('green', 'amber', 'red', 'critical', 'expired')),

  -- Risk (from heritage crosscheck)
  risk_rating         TEXT DEFAULT 'unknown'
                        CHECK (risk_rating IN ('high', 'medium', 'low', 'unknown')),

  -- Metadata
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate ingestion
  UNIQUE (tenement_number, source)
);

-- Spatial index on tenement geometries
CREATE INDEX notices_geometry_idx ON notices USING GIST (geometry);
CREATE INDEX notices_pbc_id_idx ON notices (pbc_id);
CREATE INDEX notices_deadline_date_idx ON notices (deadline_date);
CREATE INDEX notices_status_idx ON notices (status);

-- ============================================================
-- HERITAGE SITES — Sovereign PBC Cultural Register
--
-- CRITICAL DESIGN PRINCIPLES (Top End 2025 + Sovereignty):
-- 1. No field asking WHY a site is significant — only THAT it is.
-- 2. PBCs self-populate only. No auto-ingestion from AHIS/AHIMS.
-- 3. Dilji Labs cannot access individual records — aggregate only.
-- 4. PBCs can export or delete their complete dataset at any time.
-- ============================================================
CREATE TABLE heritage_sites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,

  -- Site classification (accepted legal categories per s237(b) case law)
  site_type           TEXT NOT NULL CHECK (site_type IN (
    'dreaming_site',
    'dreaming_track',
    'waterhole',
    'rock_art',
    'burial_ground',
    'ochre_deposit',
    'boundary_marker',
    'underground_dreaming',
    'ceremony_ground',
    'other'
  )),

  -- Significance assertion — NOT an explanation of why.
  -- A statement that significance exists, authored by a knowledge holder.
  -- Post-Top End 2025: cogent evidence of significance, not explanation.
  significance_assertion  TEXT NOT NULL,

  -- Spatial — at the level of precision the PBC chooses to disclose
  location            GEOMETRY(GEOMETRY, 4326),
  location_precision  TEXT DEFAULT 'approximate'
                        CHECK (location_precision IN ('precise', 'approximate', 'region_only')),

  -- Buffer zone — tenements within this radius trigger a risk flag
  -- even if precise coordinates are not disclosed
  buffer_radius_m     INTEGER DEFAULT 5000,  -- metres

  -- Access restriction — enforced at RLS level
  access_restriction  TEXT NOT NULL DEFAULT 'unrestricted'
                        CHECK (access_restriction IN (
                          'unrestricted',
                          'gender_restricted_male',
                          'gender_restricted_female',
                          'knowledge_holder_only',
                          'admin_only'
                        )),

  -- Attribution
  created_by          UUID REFERENCES auth.users(id),
  verified_by         TEXT,  -- Name of knowledge holder who affirmed significance
  verified_at         DATE,

  -- Active flag — soft delete
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index on heritage site locations
CREATE INDEX heritage_sites_location_idx ON heritage_sites USING GIST (location);
CREATE INDEX heritage_sites_pbc_id_idx ON heritage_sites (pbc_id);
CREATE INDEX heritage_sites_active_idx ON heritage_sites (active) WHERE active = true;

-- ============================================================
-- OBJECTIONS — Form 4 Drafts and Lodgement Status
-- ============================================================
CREATE TABLE objections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id           UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,

  -- S237 grounds (at least one must be asserted)
  ground_a            BOOLEAN NOT NULL DEFAULT false,  -- Community/social activities
  ground_b            BOOLEAN NOT NULL DEFAULT false,  -- Areas/sites of particular significance
  ground_c            BOOLEAN NOT NULL DEFAULT false,  -- Major disturbance

  -- Evidence summary (auto-generated from heritage crosscheck)
  -- Human-reviewed before lodgement
  evidence_summary    TEXT,

  -- Non-disclosure direction requested for restricted information
  non_disclosure_requested  BOOLEAN NOT NULL DEFAULT false,
  non_disclosure_details    TEXT,

  -- Status workflow
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'reviewed', 'lodged', 'withdrawn')),
  pathway             TEXT CHECK (pathway IN ('object', 'negotiate', 'monitor', 'escalate')),

  -- Lodgement
  lodged_at           TIMESTAMPTZ,
  lodged_by           UUID REFERENCES auth.users(id),
  nntt_reference      TEXT,  -- NNTT case number if lodged

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX objections_notice_id_idx ON objections (notice_id);
CREATE INDEX objections_pbc_id_idx ON objections (pbc_id);

-- ============================================================
-- ALERTS — Push Notification Log
-- ============================================================
CREATE TABLE alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,
  notice_id           UUID REFERENCES notices(id) ON DELETE SET NULL,
  alert_type          TEXT NOT NULL CHECK (alert_type IN (
    'new_notice',
    'deadline_60',
    'deadline_30',
    'deadline_14',
    'deadline_7',
    'deadline_expired'
  )),
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at     TIMESTAMPTZ,
  acknowledged_by     UUID REFERENCES auth.users(id)
);

CREATE INDEX alerts_pbc_id_idx ON alerts (pbc_id);
CREATE INDEX alerts_notice_id_idx ON alerts (notice_id);

-- ============================================================
-- STAFF — PBC Staff Accounts
-- ============================================================
CREATE TABLE staff (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,
  role                TEXT NOT NULL DEFAULT 'read_only'
                        CHECK (role IN ('admin', 'heritage_officer', 'read_only')),

  -- Gender flag — used for gender-restricted heritage site access
  -- Set by PBC admin. Dilji Labs does not set or read this.
  gender_access       TEXT CHECK (gender_access IN ('male', 'female', 'both', NULL)),

  -- Knowledge holder designation — set by PBC admin
  is_knowledge_holder BOOLEAN NOT NULL DEFAULT false,

  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, pbc_id)
);

CREATE INDEX staff_user_id_idx ON staff (user_id);
CREATE INDEX staff_pbc_id_idx ON staff (pbc_id);

-- ============================================================
-- PUSH SUBSCRIPTIONS — Web Push API endpoint storage
-- ============================================================
CREATE TABLE push_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pbc_id              UUID NOT NULL REFERENCES pbcs(id) ON DELETE CASCADE,
  endpoint            TEXT NOT NULL,
  p256dh              TEXT NOT NULL,
  auth_key            TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
