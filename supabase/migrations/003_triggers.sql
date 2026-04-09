-- ============================================================
-- 003_triggers.sql
-- Defending Country Intel — Triggers & Automation
-- Dilji Labs / Kado Muir — April 2026
--
-- CRITICAL: The deadline engine is the most important feature.
-- A missed four-month deadline cannot be recovered.
-- ============================================================

-- ============================================================
-- TRIGGER 1: Calculate deadline_date on notice insert
-- Adds exactly 4 calendar months from notification_date
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Four months from notification date (s32 NTA)
  NEW.deadline_date := NEW.notification_date + INTERVAL '4 months';
  -- Set initial deadline status
  NEW.deadline_status := (
    CASE
      WHEN NEW.deadline_date - CURRENT_DATE > 60 THEN 'green'
      WHEN NEW.deadline_date - CURRENT_DATE > 30 THEN 'amber'
      WHEN NEW.deadline_date - CURRENT_DATE > 0  THEN 'red'
      ELSE 'expired'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notice_calculate_deadline
  BEFORE INSERT ON notices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_deadline();

-- ============================================================
-- TRIGGER 2: Update deadline_status daily
-- Run via Cloudflare Worker cron (not a DB trigger — see worker)
-- This function is called by the Worker's daily cron job
-- ============================================================
CREATE OR REPLACE FUNCTION update_all_deadline_statuses()
RETURNS void AS $$
BEGIN
  UPDATE notices SET
    deadline_status = CASE
      WHEN deadline_date - CURRENT_DATE > 60 THEN 'green'
      WHEN deadline_date - CURRENT_DATE > 30 THEN 'amber'
      WHEN deadline_date - CURRENT_DATE > 14 THEN 'red'
      WHEN deadline_date - CURRENT_DATE > 0  THEN 'critical'
      ELSE 'expired'
    END,
    status = CASE
      WHEN deadline_date < CURRENT_DATE AND status = 'active' THEN 'expired'
      ELSE status
    END,
    updated_at = now()
  WHERE status NOT IN ('objection_lodged', 'withdrawn');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER 3: updated_at timestamp on notices
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER heritage_sites_updated_at
  BEFORE UPDATE ON heritage_sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER objections_updated_at
  BEFORE UPDATE ON objections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: Heritage crosscheck
-- Called by Worker after notice ingestion.
-- Returns risk rating based on spatial intersection.
-- Runs as service_role — sees ALL heritage sites regardless of
-- access restriction. Risk rating is computed from full dataset.
-- Staff see the RATING, not the restricted site details.
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_heritage_risk(p_notice_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_risk TEXT := 'unknown';
  v_pbc_id UUID;
  v_notice_geometry GEOMETRY;
  v_high_count INTEGER;
  v_medium_count INTEGER;
BEGIN
  -- Get notice details
  SELECT pbc_id, geometry INTO v_pbc_id, v_notice_geometry
  FROM notices WHERE id = p_notice_id;

  IF v_notice_geometry IS NULL THEN
    RETURN 'unknown';
  END IF;

  -- HIGH: sites within tenement boundary or buffer zone
  SELECT COUNT(*) INTO v_high_count
  FROM heritage_sites
  WHERE pbc_id = v_pbc_id
    AND active = true
    AND (
      ST_Intersects(location, v_notice_geometry)
      OR ST_DWithin(
        location::geography,
        ST_Centroid(v_notice_geometry)::geography,
        buffer_radius_m
      )
    );

  -- MEDIUM: tenement adjacent to Dreaming tracks or within 10km of significant area
  SELECT COUNT(*) INTO v_medium_count
  FROM heritage_sites
  WHERE pbc_id = v_pbc_id
    AND active = true
    AND site_type IN ('dreaming_track', 'waterhole', 'ceremony_ground')
    AND ST_DWithin(
      location::geography,
      ST_Centroid(v_notice_geometry)::geography,
      10000  -- 10km radius for medium risk
    );

  -- Determine risk level
  IF v_high_count > 0 THEN
    v_risk := 'high';
  ELSIF v_medium_count > 0 THEN
    v_risk := 'medium';
  ELSE
    -- Check if area has any registered sites at all (LOW vs UNKNOWN)
    IF EXISTS (
      SELECT 1 FROM heritage_sites
      WHERE pbc_id = v_pbc_id AND active = true
    ) THEN
      v_risk := 'low';
    ELSE
      -- No heritage survey done — UNKNOWN, not LOW
      -- UNKNOWN ≠ SAFE. This distinction is critical.
      v_risk := 'unknown';
    END IF;
  END IF;

  -- Update the notice
  UPDATE notices SET risk_rating = v_risk WHERE id = p_notice_id;

  RETURN v_risk;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Get notices requiring alert dispatch
-- Called by Worker cron to identify which alerts to send
-- ============================================================
CREATE OR REPLACE FUNCTION get_pending_alerts()
RETURNS TABLE (
  notice_id     UUID,
  pbc_id        UUID,
  alert_type    TEXT,
  days_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id as notice_id,
    n.pbc_id,
    CASE
      WHEN n.deadline_date - CURRENT_DATE = 60 THEN 'deadline_60'
      WHEN n.deadline_date - CURRENT_DATE = 30 THEN 'deadline_30'
      WHEN n.deadline_date - CURRENT_DATE = 14 THEN 'deadline_14'
      WHEN n.deadline_date - CURRENT_DATE = 7  THEN 'deadline_7'
      WHEN n.deadline_date < CURRENT_DATE      THEN 'deadline_expired'
    END as alert_type,
    (n.deadline_date - CURRENT_DATE)::INTEGER as days_remaining
  FROM notices n
  WHERE
    n.status = 'active'
    AND n.deadline_date - CURRENT_DATE IN (60, 30, 14, 7)
    -- Hasn't been sent today already
    AND NOT EXISTS (
      SELECT 1 FROM alerts a
      WHERE a.notice_id = n.id
        AND a.alert_type = CASE
          WHEN n.deadline_date - CURRENT_DATE = 60 THEN 'deadline_60'
          WHEN n.deadline_date - CURRENT_DATE = 30 THEN 'deadline_30'
          WHEN n.deadline_date - CURRENT_DATE = 14 THEN 'deadline_14'
          WHEN n.deadline_date - CURRENT_DATE = 7  THEN 'deadline_7'
        END
        AND a.sent_at::DATE = CURRENT_DATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
