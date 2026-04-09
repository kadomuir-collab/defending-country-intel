-- ============================================================
-- 002_rls.sql
-- Defending Country Intel — Row Level Security Policies
-- Dilji Labs / Kado Muir — April 2026
--
-- PRINCIPLES:
-- 1. Each PBC sees only their own data. Cross-PBC access is impossible.
-- 2. Heritage sites with access restrictions visible only to authorised staff.
-- 3. Dilji Labs admin: aggregate stats only, never individual heritage records.
-- 4. The deadline engine runs as service_role (bypasses RLS) — secure the key.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE pbcs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_sites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE objections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION — Get current user's PBC ID
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_pbc_id()
RETURNS UUID AS $$
  SELECT pbc_id FROM staff
  WHERE user_id = auth.uid() AND active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- HELPER FUNCTION — Get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM staff
  WHERE user_id = auth.uid() AND pbc_id = get_user_pbc_id() AND active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- HELPER FUNCTION — Get current user's gender access
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_gender_access()
RETURNS TEXT AS $$
  SELECT gender_access FROM staff
  WHERE user_id = auth.uid() AND pbc_id = get_user_pbc_id() AND active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- HELPER FUNCTION — Check if user is knowledge holder
-- ============================================================
CREATE OR REPLACE FUNCTION is_knowledge_holder()
RETURNS BOOLEAN AS $$
  SELECT is_knowledge_holder FROM staff
  WHERE user_id = auth.uid() AND pbc_id = get_user_pbc_id() AND active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- PBCS — Staff can view their own PBC only
-- ============================================================
CREATE POLICY "pbcs_select_own"
  ON pbcs FOR SELECT
  USING (id = get_user_pbc_id());

-- ============================================================
-- NOTICES — Staff can view notices for their PBC only
-- ============================================================
CREATE POLICY "notices_select_own_pbc"
  ON notices FOR SELECT
  USING (pbc_id = get_user_pbc_id());

CREATE POLICY "notices_update_own_pbc"
  ON notices FOR UPDATE
  USING (pbc_id = get_user_pbc_id())
  WITH CHECK (pbc_id = get_user_pbc_id());

-- ============================================================
-- HERITAGE SITES — Complex access control
--
-- Rule: All staff can see unrestricted sites.
-- Gender-restricted: visible only to staff with matching gender access.
-- Knowledge holder only: visible only to designated knowledge holders.
-- Admin only: visible only to PBC admins.
--
-- CRITICAL: Risk ratings are generated from ALL matching records
-- (server-side, service_role). Staff only see records they are
-- authorised to view.
-- ============================================================
CREATE POLICY "heritage_select_unrestricted"
  ON heritage_sites FOR SELECT
  USING (
    pbc_id = get_user_pbc_id()
    AND active = true
    AND access_restriction = 'unrestricted'
  );

CREATE POLICY "heritage_select_gender_male"
  ON heritage_sites FOR SELECT
  USING (
    pbc_id = get_user_pbc_id()
    AND active = true
    AND access_restriction = 'gender_restricted_male'
    AND get_user_gender_access() IN ('male', 'both')
  );

CREATE POLICY "heritage_select_gender_female"
  ON heritage_sites FOR SELECT
  USING (
    pbc_id = get_user_pbc_id()
    AND active = true
    AND access_restriction = 'gender_restricted_female'
    AND get_user_gender_access() IN ('female', 'both')
  );

CREATE POLICY "heritage_select_knowledge_holder"
  ON heritage_sites FOR SELECT
  USING (
    pbc_id = get_user_pbc_id()
    AND active = true
    AND access_restriction = 'knowledge_holder_only'
    AND is_knowledge_holder() = true
  );

CREATE POLICY "heritage_select_admin_only"
  ON heritage_sites FOR SELECT
  USING (
    pbc_id = get_user_pbc_id()
    AND active = true
    AND access_restriction = 'admin_only'
    AND get_user_role() = 'admin'
  );

-- Heritage insert — heritage officers and admins only
CREATE POLICY "heritage_insert"
  ON heritage_sites FOR INSERT
  WITH CHECK (
    pbc_id = get_user_pbc_id()
    AND get_user_role() IN ('admin', 'heritage_officer')
  );

-- Heritage update — heritage officers and admins only
CREATE POLICY "heritage_update"
  ON heritage_sites FOR UPDATE
  USING (
    pbc_id = get_user_pbc_id()
    AND get_user_role() IN ('admin', 'heritage_officer')
  );

-- Heritage soft-delete (set active=false) — admins only
-- Hard delete not permitted through client — use service_role export/delete flow

-- ============================================================
-- OBJECTIONS — Staff can manage objections for their PBC
-- ============================================================
CREATE POLICY "objections_select_own_pbc"
  ON objections FOR SELECT
  USING (pbc_id = get_user_pbc_id());

CREATE POLICY "objections_insert_own_pbc"
  ON objections FOR INSERT
  WITH CHECK (
    pbc_id = get_user_pbc_id()
    AND get_user_role() IN ('admin', 'heritage_officer')
  );

CREATE POLICY "objections_update_own_pbc"
  ON objections FOR UPDATE
  USING (
    pbc_id = get_user_pbc_id()
    AND get_user_role() IN ('admin', 'heritage_officer')
  );

-- ============================================================
-- ALERTS — Staff can view and acknowledge alerts for their PBC
-- ============================================================
CREATE POLICY "alerts_select_own_pbc"
  ON alerts FOR SELECT
  USING (pbc_id = get_user_pbc_id());

CREATE POLICY "alerts_update_own_pbc"
  ON alerts FOR UPDATE
  USING (pbc_id = get_user_pbc_id());

-- ============================================================
-- STAFF — Users can view their own staff record only
-- Admins can view all staff in their PBC
-- ============================================================
CREATE POLICY "staff_select_own"
  ON staff FOR SELECT
  USING (
    user_id = auth.uid()
    OR (pbc_id = get_user_pbc_id() AND get_user_role() = 'admin')
  );

CREATE POLICY "staff_insert_admin"
  ON staff FOR INSERT
  WITH CHECK (
    pbc_id = get_user_pbc_id()
    AND get_user_role() = 'admin'
  );

CREATE POLICY "staff_update_admin"
  ON staff FOR UPDATE
  USING (
    pbc_id = get_user_pbc_id()
    AND get_user_role() = 'admin'
  );

-- ============================================================
-- PUSH SUBSCRIPTIONS — Users manage their own subscriptions
-- ============================================================
CREATE POLICY "push_select_own"
  ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "push_insert_own"
  ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_delete_own"
  ON push_subscriptions FOR DELETE
  USING (user_id = auth.uid());
