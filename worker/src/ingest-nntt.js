// worker/src/ingest-nntt.js
const NNTT_BASE = 'https://services.arcgis.com/HvI5rMgxTzXmcPvH/arcgis/rest/services'
const FUTURE_ACTS_LAYER = `${NNTT_BASE}/FA_Objections_Nat/FeatureServer/0`

export async function ingestNNTT(env) {
  const pbcs = await getActivePBCs(env)
  if (!pbcs.length) {
    return { ingested: 0, message: 'No active PBCs registered' }
  }

  let totalIngested = 0
  const errors = []

  for (const pbc of pbcs) {
    try {
      const notices = await queryNNTTForPBC(pbc)
      const ingested = await upsertNotices(env, pbc.id, notices)
      totalIngested += ingested
    } catch (err) {
      errors.push({ pbc: pbc.name, error: err.message })
      console.error(`[NNTT] Failed for PBC ${pbc.name}:`, err)
    }
  }

  return { ingested: totalIngested, pbcs_checked: pbcs.length, errors }
}

async function getActivePBCs(env) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pbcs?select=id,name,determination_id&active=eq.true`,
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

async function queryNNTTForPBC(pbc) {
  if (!pbc.boundary) {
    console.warn(`[NNTT] PBC ${pbc.name} has no boundary — skipping`)
    return []
  }

  const params = new URLSearchParams({
    where: "1=1",
    geometry: JSON.stringify(pbc.boundary),
    geometryType: 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID,NOTICE_NO,TENEMENT_NO,TENEMENT_TYPE,GRANTEE,GOVT_PARTY,NOTIFICATION_DATE,STATUS,NOTICE_URL',
    f: 'geojson',
    returnGeometry: 'true'
  })

  const response = await fetch(`${FUTURE_ACTS_LAYER}/query?${params}`)
  if (!response.ok) throw new Error(`NNTT API error: ${response.status}`)

  const data = await response.json()
  if (!data.features) return []

  return data.features
    .filter(f => f.properties)
    .map(parseNNTTFeature)
    .filter(Boolean)
}
async function upsertNotices(env, pbcId, notices) {
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

  return records.length
}

function parseNNTTFeature(feature) {
  const props = feature.properties
  const notificationDate = parseNNTTDate(props.NOTIFICATION_DATE)
  if (!notificationDate) return null

  return {
    tenement_number: props.TENEMENT_NO || props.NOTICE_NO,
    tenement_type: normaliseTenementType(props.TENEMENT_TYPE),
    grantee: props.GRANTEE || null,
    government_party: props.GOVT_PARTY || null,
    source: 'nntt',
    source_id: String(props.OBJECTID),
    notice_url: props.NOTICE_URL || null,
    notification_date: notificationDate,
    geometry: feature.geometry ? JSON.stringify(feature.geometry) : null,
    status: 'active'
  }
}

function parseNNTTDate(dateValue) {
  if (!dateValue) return null
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