// ============================================================
// worker/src/deadline.js
// Deadline Status Updates & Push Alert Dispatch
// Dilji Labs / Kado Muir — April 2026
//
// CRITICAL: This is the most important module in the system.
// A missed four-month deadline cannot be recovered.
// This runs every day, first thing, before ingestion.
// ============================================================

// ============================================================
// Update deadline_status on all active notices
// Calls the DB function defined in 003_triggers.sql
// ============================================================
export async function updateDeadlineStatuses(env) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/update_all_deadline_statuses`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  )

  if (!response.ok) {
    throw new Error(`Deadline update failed: ${response.status}`)
  }

  return { updated: true, timestamp: new Date().toISOString() }
}

// ============================================================
// Dispatch push notifications for approaching deadlines
// Alert thresholds: 60, 30, 14, 7 days
// ============================================================
export async function dispatchAlerts(env) {
  // Get pending alerts from DB function
  const pendingResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_pending_alerts`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  )

  if (!pendingResponse.ok) {
    throw new Error(`Failed to get pending alerts: ${pendingResponse.status}`)
  }

  const pending = await pendingResponse.json()

  if (!pending.length) {
    return { dispatched: 0, message: 'No alerts pending' }
  }

  let dispatched = 0
  const errors = []

  for (const alert of pending) {
    try {
      await sendDeadlineAlert(env, alert)
      await logAlert(env, alert)
      dispatched++
    } catch (err) {
      errors.push({ notice_id: alert.notice_id, error: err.message })
      console.error('[Deadline] Alert dispatch failed:', err)
    }
  }

  return { dispatched, total_pending: pending.length, errors }
}

// ============================================================
// Send push notification to all staff of a PBC
// ============================================================
async function sendDeadlineAlert(env, alert) {
  // Get push subscriptions for this PBC
  const subsResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?pbc_id=eq.${alert.pbc_id}&select=endpoint,p256dh,auth_key`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  )

  const subscriptions = await subsResponse.json()
  if (!subscriptions.length) return

  const message = buildAlertMessage(alert)

  // Send to each subscription
  for (const sub of subscriptions) {
    await sendWebPush(env, sub, message)
  }
}

// ============================================================
// Build alert message content
// ============================================================
function buildAlertMessage(alert) {
  const urgencyMap = {
    'new_notice': { title: '⚠️ New s29 Notice', urgency: 'normal' },
    'deadline_60': { title: '📋 60 Days Remaining', urgency: 'normal' },
    'deadline_30': { title: '🟡 30 Days Remaining', urgency: 'high' },
    'deadline_14': { title: '🔴 14 Days — Urgent', urgency: 'high' },
    'deadline_7':  { title: '🚨 7 Days — Critical', urgency: 'urgent' },
    'deadline_expired': { title: '⏱️ Deadline Expired', urgency: 'normal' }
  }

  const { title, urgency } = urgencyMap[alert.alert_type] || urgencyMap['deadline_60']

  const bodyMap = {
    'new_notice': 'A new section 29 notice has been received for your Country. Open the app to review.',
    'deadline_60': `You have 60 days to lodge an objection or respond. Begin heritage crosscheck now.`,
    'deadline_30': `30 days remaining. If you intend to object, begin drafting your Form 4 response.`,
    'deadline_14': `14 days remaining. Objection must be filed or a formal decision made not to object.`,
    'deadline_7':  `7 days remaining. This is critical. Open the app immediately.`,
    'deadline_expired': `The objection deadline has passed. Document the outcome in the platform.`
  }

  return {
    title,
    body: bodyMap[alert.alert_type] || 'Action required on your Country.',
    urgency,
    data: {
      notice_id: alert.notice_id,
      alert_type: alert.alert_type,
      days_remaining: alert.days_remaining,
      url: `/watchtower/${alert.notice_id}`
    }
  }
}

// ============================================================
// Web Push API dispatch
// Uses VAPID authentication
// ============================================================
async function sendWebPush(env, subscription, message) {
  // Note: Full VAPID implementation requires the web-push library
  // or manual JWT signing. In production, use a Supabase Edge Function
  // with the web-push npm package, or call a push service.
  //
  // For MVP: use a simple POST to the subscription endpoint
  // with proper VAPID headers (implement when integrating)
  //
  // TODO: Implement VAPID JWT signing here
  // Reference: https://developers.google.com/web/fundamentals/push-notifications

  const payload = JSON.stringify({
    notification: {
      title: message.title,
      body: message.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: message.data,
      vibrate: [200, 100, 200],
      requireInteraction: message.urgency === 'urgent'
    }
  })

  // Placeholder — replace with actual VAPID push in Phase 1 completion
  console.log('[Push] Would send to endpoint:', subscription.endpoint.substring(0, 50) + '...')
  console.log('[Push] Message:', message.title)

  return { sent: true, endpoint: subscription.endpoint }
}

// ============================================================
// Log dispatched alert to alerts table
// ============================================================
async function logAlert(env, alert) {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/alerts`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pbc_id: alert.pbc_id,
        notice_id: alert.notice_id,
        alert_type: alert.alert_type
      })
    }
  )
}
