// worker/src/ingest-dmirs.js
// DMIRS Early Warning Ingestion — Nyimu
// Queries SLIP public ArcGIS REST API for pending tenements
// intersecting PBC/claim boundaries
// Dilji Labs / Kado Muir — April 2026

const SLIP_BASE = 'https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer'

// Layer 19 — Tenements Release Pending (DMIRS-030)
// These are the Early Warning notices — before s29 is issued
const RELEASE_PENDING_LAYER = `${SLIP_BASE}/19`

// Layer 3 — Live Mining Tenements (DMIRS-003)
// All active tenements for Country Map context
const LIVE_TENEMENTS_LAYER = `${SLIP_BASE}/3`

export async function ingestDMIRS(env) {
  const pbcs = await getActivePBCs(env)
  if (!pbcs.length) {
    return { ingested: 0, message: 'No active PBCs registered' }
  }

  let totalIngested = 0
  const errors = []

  for (const pbc of pbcs) {
    try {
      const notices = await queryDMIRSForPBC(pbc)
      if (notices.length) {
        const ingested = await upsertEarlyWarnings(env, pbc.id, notices)
        totalIngested += ingested
      }
    } catch (err) {
      errors.push({ pbc: pbc.name, error: err.message })
      console.error(`[DMIRS] Failed for PBC ${pbc.name}:`, err)
    }
  }

  return { ingested: totalIngested, pbcs_checked: pbcs.length, errors }
}

async function getActivePBCs(env) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pbcs?select=id,name,determination_id,boundary&active=eq.true`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  )
  if (!response.ok) throw new Error(`Failed to fetch PBCs: ${response.status}`)
  return response.json()
}

async function queryDMIRSForPBC(pbc) {
  if (!pbc.boundary) {
    console.warn(`[DMIRS] PBC ${pbc.name} has no boundary — skipping`)
    return []
  }

  const params = new URLSearchParams({
    where: "1=1",
    geometry: JSON.stringify(pbc.boundary),
    geometryType: 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: [
      'TENEMENT_NO',
      'TENEMENT_TYPE',
      'HOLDER',
      'LODGED_DATE',
      'STATUS',
      'NATIVE_TITLE_STATUS',
      'AREA_HECTARES'
    ].join(','),
    f: 'geojson',
    returnGeometry: 'true'
  })

  const url = `${RELEASE_PENDING_LAYER}/query?${params}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`SLIP API error: ${response.status}`)

  const data = await response.json()
  if (!data.features) return []

  return data.features
    .filter(f => f.properties)
    .map(parseDMIRSFeature)
    .filter(Boolean)
}

function parseDMIRSFeature(feature) {
  const props = feature.properties

  const lodgedDate = props.LODGED_DATE
    ? new Date(props.LODGED_DATE).toISOString().split('T')[0]
    : null

  if (!props.TENEMENT_NO) return null

  return {
    tenement_number: props.TENEMENT_NO,
    tenement_type: props.TENEMENT_TYPE || 'unknown',
    grantee: props.HOLDER || null,
    government_party: 'DMIRS',
    source: 'dmirs',
    source_id: props.TENEMENT_NO,
    notification_date: lodgedDate || new Date().toISOString().split('T')[0],
    geometry: feature.geometry ? JSON.stringify(feature.geometry) : null,
    status: 'application_lodged',
    // Early warning — deadline is not yet triggered
    // We set notification_date to lodgement date
    // deadline_date will be calculated by DB trigger
    // but won't be legally binding until s29 is issued
  }
}

async function upsertEarlyWarnings(env, pbcId, notices) {
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
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(records)
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Supabase upsert failed: ${err}`)
  }

  console.log(`[DMIRS] Inserted ${records.length} early warnings for PBC ${pbcId}`)
  return records.length
}