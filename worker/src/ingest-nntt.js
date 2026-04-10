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
    returnGeometry: '