// ============================================================
// worker/src/ingest-nntt.js
// NNTT Open Data ArcGIS REST API Ingestion
// Dilji Labs / Kado Muir — April 2026
//
// Queries the NNTT Future Acts layer for s29 notices that
// spatially intersect with registered PBC determination areas.
//
// Data source: https://data-nntt.opendata.arcgis.com/
// Layer: FA_Objections_Nat (Future Acts / expedited procedure)
// Access: Public, no API key required
// ============================================================

const NNTT_BASE = 'https://services.arcgis.com/HvI5rMgxTzXmcPvH/arcgis/rest/services'
const FUTURE_ACTS_LAYER = `${NNTT_BASE}/FA_Objections_Nat/FeatureServer/0`

// ============================================================
// Main ingestion function
// ============================================================
export async function ingestNNTT(env) {
  const supabase = createSupabaseClient(env)

  // 1. Get all active PBC boundaries from Supabase
  const pbcs = await getActivePBCs(supabase)
  if (!pbcs.length) {
    return { ingested: 0, message: 'No active PBCs registered' }
  }

  let totalIngested = 0
  const errors = []

  // 2. For each PBC, query NNTT for notices intersecting their boundary
  for (const pbc of pbcs) {
    try {
      const notices = await queryNNTTForPBC(pbc)
      const ingested = await upsertNotices(supabase, pbc.id, notices)
      totalIngested += ingested
    } catch (err) {
      errors.push({ pbc: pbc.name, error: err.message })
      console.error(`[NNTT] Failed for PBC ${pbc.name}:`, err)
    }
  }

  return {
    ingested: totalIngested,
    pbcs_checked: pbcs.length,
    errors
  }
}

// ============================================================
// Get all active PBCs with their boundary geometries
// ============================================================
async function getActivePBCs(supabase) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pbcs?select=id,name,determination_id,boundary&active=eq.true`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch PBCs: ${response.status}`)
  }

  return response.json()
}

// ============================================================
// Query NNTT ArcGIS REST API for a specific PBC boundary
// ============================================================
async function queryNNTTForPBC(pbc) {
  if (!pbc.boundary) {
    console.warn(`[NNTT] PBC ${pbc.name} has no boundary geometry — skipping`)
    return []
  }

  // Build spatial query — intersect with PBC determination area
  const params = new URLSearchParams({
    where: "1=1",                                    // All records
    geometry: JSON.stringify(pbc.boundary),          // PBC boundary as filter
    geometryType: 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: [
      'OBJECTID',
      'NOTICE_NO',
      'TENEMENT_NO',
      'TENEMENT_TYPE',
      'GRANTEE',
      'GOVT_PARTY',
      'NOTIFICATION_DATE',
      'EXPIRY_DATE',
      'STATUS',
      'NOTICE_URL'
    ].join(','),
    f: 'geojson',
    returnGeometry: 'true'
  })

  const url = `${FUTURE_ACTS_LAYER}/query?${params}`

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`NNTT API error: ${response.status}`)
  }

  const data = await response.json()

  if (!data.features) {
    return []
  }

  // Parse features into our notice format
  return data.features
    .filter(f => f.properties)
    .map(f => parseNNTTFeature(f))
    .filter(Boolean)
}

// ============================================================
// Parse an NNTT GeoJSON feature into our notice schema
// ============================================================
function parseNNTTFeature(feature) {
  const props = feature.properties

  // Extract notification date — critical for deadline calculation
  const notificationDate = parseNNTTDate(props.NOTIFICATION_DATE)
  if (!notificationDate) {
    console.warn('[NNTT] Notice missing notification date:', props.NOTICE_NO)
    return null
  }

  return {
    tenement_number: props.TENEMENT_NO || props.NOTICE_NO,
    tenement_type: normaliseTenementType(props.TENEMENT_TYPE),
    grantee: props.GRANTEE || null,
    government_party: props.GOVT_PARTY || null,
    source: 'nntt',
    source_id: String(props.OBJECTID),
    notice_url: props.NOTICE_URL || null,
    notification_date: notificationDate,
    // deadline_date is calculated by DB trigger on insert
    geometry: feature.geometry ? JSON.stringify(feature.geometry) : null,
    status: 'active'
  }
}

// ============================================================
// Upsert notices to Supabase (ignore duplicates)
// ============================================================
async function upsertNotices(supabase, pbcId, notices) {
  if (!notices.length) return 0

  const records = notices.map(n => ({ ...n, pbc_id: pbcId }))

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/notices`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'  // Upsert — skip if exists
      },
      body: JSON.stringify(records)
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Supabase upsert failed: ${err}`)
  }

  return records.length
}

// ============================================================
// Utilities
// ============================================================

function createSupabaseClient(env) {
  // Minimal client — just wraps the REST API with service_role key
  return { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

function parseNNTTDate(dateValue) {
  if (!dateValue) return null
  // NNTT dates may be Unix timestamps (ms) or ISO strings
  if (typeof dateValue === 'number') {
    return new Date(dateValue).toISOString().split('T')[0]
  }
  if (typeof dateValue === 'string') {
    const d = new Date(dateValue)
    if (!isNaN(d)) return d.toISOString().split('T')[0]
  }
  return null
}

function normaliseTenementType(raw) {
  if (!raw) return 'unknown'
  const map = {
    'Exploration Licence': 'EL',
    'Prospecting Licence': 'PL',
    'Mining Lease': 'ML',
    'Miscellaneous Licence': 'MISC',
    'General Purpose Lease': 'GPL'
  }
  return map[raw] || raw
}
