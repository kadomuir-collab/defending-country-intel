// ============================================================
// worker/src/index.js
// Defending Country Intel — Cloudflare Worker Entry Point
// Dilji Labs / Kado Muir — April 2026
//
// Scheduled cron: daily at 6am UTC
// Also handles HTTP requests for manual triggers (dev/admin)
// ============================================================

import { ingestNNTT } from './ingest-nntt.js'
import { ingestDMIRS } from './ingest-dmirs.js'
import { updateDeadlineStatuses, dispatchAlerts } from './deadline.js'

export default {
  // ============================================================
  // SCHEDULED — Daily cron trigger (6am UTC)
  // ============================================================
  async scheduled(event, env, ctx) {
    console.log('[DCI Worker] Cron triggered:', new Date().toISOString())

    const results = {
      nntt: null,
      dmirs: null,
      gazette: null,
      deadlines: null,
      alerts: null,
      errors: []
    }

    // 1. Update deadline statuses first (most critical operation)
    try {
      results.deadlines = await updateDeadlineStatuses(env)
      console.log('[DCI] Deadline statuses updated')
    } catch (err) {
      results.errors.push({ source: 'deadlines', error: err.message })
      console.error('[DCI] Deadline update failed:', err)
    }

    // 2. Ingest NNTT notices (primary source)
    try {
      results.nntt = await ingestNNTT(env)
      console.log('[DCI] NNTT ingestion complete:', results.nntt)
    } catch (err) {
      results.errors.push({ source: 'nntt', error: err.message })
      console.error('[DCI] NNTT ingestion failed:', err)
    }

    // 3. Ingest DMIRS (Early Warning pipeline)
    try {
      results.dmirs = await ingestDMIRS(env)
      console.log('[DCI] DMIRS ingestion complete:', results.dmirs)
    } catch (err) {
      results.errors.push({ source: 'dmirs', error: err.message })
      console.error('[DCI] DMIRS ingestion failed:', err)
    }

    // 4. Ingest WA Gazette (secondary source — add after NNTT stable)
    // Phase 2+ only
    // try {
    //   results.gazette = await ingestGazette(env)
    // } catch (err) {
    //   results.errors.push({ source: 'gazette', error: err.message })
    // }

    // 5. Dispatch push notifications for deadline alerts
    try {
      results.alerts = await dispatchAlerts(env)
      console.log('[DCI] Alerts dispatched:', results.alerts)
    } catch (err) {
      results.errors.push({ source: 'alerts', error: err.message })
      console.error('[DCI] Alert dispatch failed:', err)
    }

    if (results.errors.length > 0) {
      console.error('[DCI] Cron completed with errors:', results.errors)
    } else {
      console.log('[DCI] Cron completed successfully')
    }
  },

  // ============================================================
  // HTTP — Manual trigger for dev/admin use
  // Protect with a secret header in production
  // ============================================================
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Auth check — require secret token for manual triggers
    const authHeader = request.headers.get('X-Admin-Token')
const authParam = url.searchParams.get('token')
if (authHeader !== env.ADMIN_TOKEN && authParam !== env.ADMIN_TOKEN) {
  return new Response('Unauthorized', { status: 401 })
}

  if (url.pathname === '/trigger/nntt') {
      const result = await ingestNNTT(env)
      return Response.json(result)
    }
  if (url.pathname === '/trigger/dmirs') {
      try {
        const result = await ingestDMIRS(env)
        return Response.json(result)
      } catch (err) {
        return Response.json({ error: err.message, stack: err.stack }, { status: 500 })
      }
    }

    if (url.pathname === '/trigger/deadlines') {
      const result = await updateDeadlineStatuses(env)
      return Response.json(result)
    }

    if (url.pathname === '/trigger/alerts') {
      const result = await dispatchAlerts(env)
      return Response.json(result)
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
    }

    return new Response('Not found', { status: 404 })
  }
}
