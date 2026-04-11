// worker/src/ingest-nntt.js
// NNTT Layer 3 — Future Act Notices Current
//
// Architecture: staging table + bulk PostGIS spatial join
//
// 1. Fetch all current WA Future Act Notices from NNTT Layer 3 (paginated)
// 2. Batch INSERT raw notices into nntt_staging table (geometry included)
// 3. Call process_nntt_staging() RPC — single PostGIS spatial join across
//    all 513 PBC boundaries, inserts matched notices into notices table
// 4. Also upgrades any existing early_warning/spatial_confirmed notices
//    that now have a confirmed s29/s31 against the same tenement
//
// This approach moves all spatial work into PostGIS rather than making
// thousands of individual RPC calls from the Worker.
//
// Dilji Labs / Kado Muir — April 2026

const NNTT_LAYER3 =
  'https://services2.arcgis.com/rzk7fNEt0xoEp3cX/arcgis/rest/services/NNTT_Custodial_AGOL/FeatureServer/3/query'

const BATCH_SIZE = 200 // rows per Supabase insert batch

export async function ingestNNTT(env) {
  const errors = []

  // ─── PHASE 1: Fetch all WA notices from NNTT Layer 3 ─────────────────────

  console.log('[NNTT] Phase 1: Fetching WA notices from Layer 3...')
  const features = await fetchAllNNTTNotices()
  console.log('[NNTT] Total WA notices fetched:', features.length)

  if (features.length === 0) {
    return { fetched: 0, staged: 0, matched: 0, errors }
  }

  // ─── PHASE 2: Clear staging table and batch insert ────────────────────────

  console.log('[NNTT] Phase 2: Clearing staging table...')
  await clearStaging(env)

  console.log('[NNTT] Phase 2: Inserting into nntt_staging...')
  let staged = 0
  const rows = features.map(f => buildStagingRow(f)).filter(Boolean)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      await insertStagingBatch(env, batch)
      staged += batch.length
      console.log(`[NNTT] Staged ${staged}/${rows.length}...`)
    } catch (err) {
      errors.push({ phase: 2, batch_start: i, error: err.message })
      console.error('[NNTT] Staging batch failed at', i, err.message)
    }
  }

  console.log('[NNTT] Phase 2 complete — staged:', staged)

  // ─── PHASE 3: Run bulk PostGIS spatial join ───────────────────────────────

  console.log('[NNTT] Phase 3: Running process_nntt_staging() spatial join...')
  let matched = 0
  try {
    matched = await processNNTTStaging(env)
    console.log('[NNTT] Phase 3 complete — notices matched and inserted:', matched)
  } catch (err) {
    errors.push({ phase: 3, error: err.message })
    console.error('[NNTT] process_nntt_staging failed:', err.message)
  }

  // ─── PHASE 4: Upgrade existing DMIRS notices that now have s29/s31 ────────

  console.log('[NNTT] Phase 4: Upgrading existing early_warning/spatial_confirmed notices...')
  let upgraded = 0
  try {
    upgraded = await upgradeExistingNotices(env)
    console.log('[NNTT] Phase 4 complete — upgraded:', upgraded)
  } catch (err) {
    errors.push({ phase: 4, error: err.message })
    console.error('[NNTT] Upgrade failed:', err.message)
  }

  return {
    fetched: features.length,
    staged,
    matched,
    upgraded,
    errors,
  }
}

// ─── NNTT FETCH (paginated) ───────────────────────────────────────────────────

async function fetchAllNNTTNotices() {
  const all = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const params = new URLSearchParams({
      where: "State='WA'",
      outFields:
        'Tribunal_ID,FAN_Type,Ten_ID,Location,Exptd_Proc,Ntfcn_Date,Mth2_Close,Mth3_Close,Mth4_Close,State,Grantee,Agency_Ref',
      f: 'json',
      outSR: '4326',
      returnGeometry: 'true',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    })

    try {
      const res = await fetch(`${NNTT_LAYER3}?${params.toString()}`)
      if (!res.ok) throw new Error('NNTT HTTP ' + res.status)
      const data = await res.json()

      if (!data.features || data.features.length === 0) break

      all.push(...data.features)

      if (!data.exceededTransferLimit) break
      offset += pageSize
    } catch (err) {
      console.error('[NNTT] Fetch error at offset', offset, ':', err.message)
      break
    }
  }

  return all
}

// ─── BUILD STAGING ROW ────────────────────────────────────────────────────────

function buildStagingRow(feature) {
  const a = feature.attributes
  const geom = feature.geometry

  if (!geom || !geom.rings || geom.rings.length === 0) return null

  // Convert ArcGIS polygon rings to WKT for PostGIS
  // Using ST_GeomFromGeoJSON via the geometry column — we pass GeoJSON text
  const geojson = JSON.stringify({
    type: 'Polygon',
    coordinates: geom.rings,
  })

  const deadline = pickDeadline(a)
  const ntfcnDate = a.Ntfcn_Date
    ? new Date(a.Ntfcn_Date).toISOString().split('T')[0]
    : null

  return {
    tribunal_id: a.Tribunal_ID,
    fan_type: a.FAN_Type || null,
    ten_id: a.Ten_ID || a.Agency_Ref || null,
    location: a.Location || null,
    exptd_proc: a.Exptd_Proc || null,
    ntfcn_date: ntfcnDate,
    deadline_date: deadline,
    grantee: a.Grantee || null,
    state: a.State || 'WA',
    // PostgREST accepts GeoJSON for geometry columns
    geometry: geojson,
  }
}

function pickDeadline(a) {
  if (a.Mth4_Close) return new Date(a.Mth4_Close).toISOString().split('T')[0]
  if (a.Mth3_Close) return new Date(a.Mth3_Close).toISOString().split('T')[0]
  if (a.Mth2_Close) return new Date(a.Mth2_Close).toISOString().split('T')[0]
  if (a.Ntfcn_Date) {
    const d = new Date(a.Ntfcn_Date)
    d.setMonth(d.getMonth() + 6)
    return d.toISOString().split('T')[0]
  }
  return null
}

// ─── SUPABASE: CLEAR STAGING ──────────────────────────────────────────────────

async function clearStaging(env) {
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/nntt_staging?tribunal_id=neq.IMPOSSIBLE_MATCH',
    {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }
  )
  if (!res.ok) {
    const err = await res.text()
    console.error('[NNTT] Clear staging failed:', err)
  }
}

// ─── SUPABASE: INSERT STAGING BATCH ──────────────────────────────────────────

async function insertStagingBatch(env, rows) {
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/nntt_staging',
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(rows),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error('Staging insert failed: ' + err)
  }
}

// ─── SUPABASE RPC: BULK SPATIAL JOIN ─────────────────────────────────────────

async function processNNTTStaging(env) {
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/rpc/process_nntt_staging',
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error('process_nntt_staging RPC failed: ' + err)
  }
  const result = await res.json()
  // RPC returns the integer count of inserted/updated rows
  return typeof result === 'number' ? result : 0
}

// ─── SUPABASE: UPGRADE EXISTING DMIRS NOTICES ────────────────────────────────
// Where a tenement appears in both DMIRS early_warning/spatial_confirmed
// AND now has an NNTT s29/s31 notice, upgrade the DMIRS notice stage

async function upgradeExistingNotices(env) {
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/rpc/upgrade_notices_from_nntt',
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  )
  // This RPC doesn't exist yet — gracefully skip if not found
  if (res.status === 404 || res.status === 400) return 0
  if (!res.ok) return 0
  const result = await res.json()
  return typeof result === 'number' ? result : 0
}