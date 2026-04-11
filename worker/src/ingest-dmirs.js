// worker/src/ingest-dmirs.js
// DMIRS Early Warning — two-phase ingestion pipeline
//
// PHASE 1 (runs every night):
//   Fetch DMIRS RSS feed → INSERT all new applications as early_warning (no geometry needed)
//
// PHASE 2 (runs every night, after Phase 1):
//   For each early_warning notice → query SLIP for geometry
//   If geometry found → run find_intersecting_pbcs() RPC
//   If intersects one or more PBCs → create one spatial_confirmed row per PBC
//   If no intersection → mark as no_intersection (silent, no PBC action needed)
//
// Dilji Labs / Kado Muir — April 2026

const RSS_URL = 'https://emits.dmp.wa.gov.au/emits/advert/rss.xml'
const SLIP_BASE = 'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/3'

export async function ingestDMIRS(env) {
  const errors = []
  let phase1_inserted = 0
  let phase1_skipped = 0
  let phase2_checked = 0
  let phase2_confirmed = 0
  let phase2_no_intersection = 0

  // ─── PHASE 1: RSS → early_warning ───────────────────────────────────────────

  const rssText = await fetchRSS()
  if (!rssText) return { ingested: 0, errors: ['Failed to fetch RSS feed'] }

  const items = parseRSSItems(rssText)
  console.log('[DMIRS] Phase 1: RSS items found:', items.length)

  for (const item of items) {
    try {
      const inserted = await insertEarlyWarning(env, item)
      if (inserted) {
        phase1_inserted++
        console.log('[DMIRS] Early warning stored:', item.tenementId, item.shire)
      } else {
        phase1_skipped++ // already exists
      }
    } catch (err) {
      errors.push({ phase: 1, tenement: item.tenementId, error: err.message })
    }
  }

  console.log(`[DMIRS] Phase 1 complete — inserted: ${phase1_inserted}, skipped (existing): ${phase1_skipped}`)

  // ─── PHASE 2: early_warning → SLIP geometry check → spatial_confirmed ───────

  const pendingNotices = await getEarlyWarningNotices(env)
  console.log('[DMIRS] Phase 2: early_warning notices to check:', pendingNotices.length)

  for (const notice of pendingNotices) {
    phase2_checked++
    try {
      const geometry = await getTenementGeometry(notice.tenement_number)

      if (!geometry) {
        // SLIP doesn't have it yet — leave as early_warning, retry tomorrow
        console.log('[DMIRS] No SLIP geometry yet for:', notice.tenement_number)
        continue
      }

      const matchedPBCs = await findIntersectingPBCsRPC(env, geometry)

      if (!matchedPBCs || matchedPBCs.length === 0) {
        // Geometry confirmed but no PBC intersection — mark done, stop retrying
        await updateNoticeStage(env, notice.id, 'no_intersection', geometry, [])
        phase2_no_intersection++
        console.log('[DMIRS] No PBC intersection:', notice.tenement_number)
        continue
      }

      // Intersects one or more PBCs — create one spatial_confirmed row per PBC
      for (const pbc of matchedPBCs) {
        await upsertSpatialConfirmedNotice(env, notice, pbc, geometry)
        phase2_confirmed++
        console.log('[DMIRS] Spatial confirmed:', notice.tenement_number, '→ PBC:', pbc.name)
      }

      // Mark the original early_warning row as promoted so Phase 2 stops retrying it
      await updateNoticeStage(env, notice.id, 'spatial_confirmed', geometry, matchedPBCs.map(p => p.id))

    } catch (err) {
      errors.push({ phase: 2, tenement: notice.tenement_number, error: err.message })
    }
  }

  console.log(`[DMIRS] Phase 2 complete — checked: ${phase2_checked}, confirmed: ${phase2_confirmed}, no intersection: ${phase2_no_intersection}`)

  return {
    phase1: { inserted: phase1_inserted, skipped: phase1_skipped },
    phase2: { checked: phase2_checked, confirmed: phase2_confirmed, no_intersection: phase2_no_intersection },
    errors
  }
}

// ─── RSS FETCHING & PARSING ───────────────────────────────────────────────────

async function fetchRSS() {
  try {
    const res = await fetch(RSS_URL)
    if (!res.ok) throw new Error('RSS fetch status: ' + res.status)
    return await res.text()
  } catch (err) {
    console.error('[DMIRS] RSS fetch error:', err.message)
    return null
  }
}

function parseRSSItems(xml) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const pubDate = extractTag(block, 'pubDate')
    const description = extractTag(block, 'description') || ''

    if (!title) continue

    // Normalise tenement ID: "E45/7285" or "E 45/7285" → "E 45/7285"
    const tenementId = normaliseId(title.trim())
    const typeCode = tenementId.match(/^([A-Z]+)/)
    const tenementType = typeCode ? expandType(typeCode[1]) : 'Unknown'

    // Parse description HTML-encoded fields
    const decoded = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

    const shireMatch = decoded.match(/Shire[^<]*<\/td><td[^>]*>([^<]+)/)
    const applicantMatch = decoded.match(/Applicants[^<]*<\/td><td[^>]*>([^<]+)/)
    const areaMatch = decoded.match(/Area[^<]*<\/td><td[^>]*>([^<]+)/)
    const receivedMatch = decoded.match(/Application received on[^<]*<\/td><td[^>]*>([^<]+)/)

    const lodgementDate = receivedMatch
      ? parseAWSTDate(receivedMatch[1].trim())
      : (pubDate ? new Date(pubDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])

    items.push({
      tenementId,
      tenementType,
      shire: shireMatch ? shireMatch[1].trim() : null,
      applicant: applicantMatch ? applicantMatch[1].trim() : null,
      area: areaMatch ? areaMatch[1].trim() : null,
      lodgementDate,
    })
  }
  return items
}

// "E45/7285" → "E 45/7285", "E 45/7285" → "E 45/7285"
function normaliseId(raw) {
  return raw.replace(/^([A-Z]+)\s*(\d+)\//, '$1 $2/')
}

// Parse "10/04/2026 15:30:10" AWST → "2026-04-10"
function parseAWSTDate(str) {
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return new Date().toISOString().split('T')[0]
  return `${m[3]}-${m[2]}-${m[1]}`
}

function extractTag(xml, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

function expandType(code) {
  const map = {
    E: 'Exploration Licence',
    P: 'Prospecting Licence',
    M: 'Mining Lease',
    L: 'Miscellaneous Licence',
    G: 'General Purpose Lease',
    R: 'Retention Licence'
  }
  return map[code] || code
}

// ─── SUPABASE: PHASE 1 INSERT ─────────────────────────────────────────────────

async function insertEarlyWarning(env, item) {
  // source_id = tenement ID alone — one early_warning row per tenement, no PBC yet
  const record = {
    tenement_number: item.tenementId,
    tenement_type: item.tenementType,
    grantee: item.applicant,
    shire: item.shire,
    area: item.area,
    government_party: 'DMIRS',
    source: 'dmirs',
    source_id: item.tenementId,
    notification_date: item.lodgementDate,
    workflow_stage: 'early_warning',
    status: 'active',
    geometry: null,
    pbc_id: null,
  }

  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/notices',
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(record),
    }
  )

  if (res.status === 409) return false
  if (!res.ok) {
    const err = await res.text()
    throw new Error('Supabase insert failed: ' + err)
  }
  const body = await res.json()
  return Array.isArray(body) && body.length > 0
}

// ─── SUPABASE: GET EARLY WARNING NOTICES FOR PHASE 2 ─────────────────────────

async function getEarlyWarningNotices(env) {
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/notices?workflow_stage=eq.early_warning&source=eq.dmirs&select=id,tenement_number,tenement_type,grantee,shire,area,notification_date',
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }
  )
  if (!res.ok) return []
  return res.json()
}

// ─── SLIP: GEOMETRY LOOKUP ────────────────────────────────────────────────────

async function getTenementGeometry(tenementId) {
  // tenementId is already normalised to "E 45/7285"
  // SLIP fmt_tenid stores "E 45/7285" or "E 45/7285-I" (with survey suffix)
  // Use LIKE with % wildcard to match both
  const params = new URLSearchParams({
    where: `fmt_tenid LIKE '${tenementId}%'`,
    outFields: 'tenid,fmt_tenid,tenstatus,type,holder1,legal_area',
    f: 'geojson',
    outSR: '4326',
    returnGeometry: 'true',
  })
  try {
    const res = await fetch(`${SLIP_BASE}/query?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.features || !data.features.length) return null
    return data.features[0].geometry
  } catch (err) {
    console.warn('[DMIRS] SLIP lookup failed for', tenementId, err.message)
    return null
  }
}

// ─── SUPABASE: UPDATE STAGE ON ORIGINAL EARLY_WARNING ROW ────────────────────

async function updateNoticeStage(env, noticeId, stage, geometry, pbcIds) {
  const update = {
    workflow_stage: stage,
    geometry: geometry ? JSON.stringify(geometry) : null,
    pbc_ids: pbcIds.length ? pbcIds : null,
  }
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/notices?id=eq.' + noticeId,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    console.error('[DMIRS] Stage update failed:', err)
  }
}

// ─── SUPABASE: INSERT spatial_confirmed NOTICE PER PBC ───────────────────────

async function upsertSpatialConfirmedNotice(env, originalNotice, pbc, geometry) {
  // Each intersecting PBC gets its own notice row
  // source_id is scoped per PBC — prevents duplicate rows on re-run
  const record = {
    pbc_id: pbc.id,
    tenement_number: originalNotice.tenement_number,
    tenement_type: originalNotice.tenement_type,
    grantee: originalNotice.grantee,
    shire: originalNotice.shire,
    area: originalNotice.area,
    government_party: 'DMIRS',
    source: 'dmirs',
    source_id: `${originalNotice.tenement_number}::${pbc.id}`,
    notification_date: originalNotice.notification_date,
    workflow_stage: 'spatial_confirmed',
    status: 'active',
    geometry: JSON.stringify(geometry),
  }

  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/notices',
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(record),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error('Supabase spatial_confirmed insert failed: ' + err)
  }
}

// ─── SUPABASE RPC: SPATIAL INTERSECTION ──────────────────────────────────────

async function findIntersectingPBCsRPC(env, geometry) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/find_intersecting_pbcs`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenement_geojson: JSON.stringify(geometry) }),
    }
  )
  if (!response.ok) return []
  return response.json()
}