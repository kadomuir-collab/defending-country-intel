// lib/deadline.js
// Deadline calculation utilities — client-side display logic
// The authoritative deadline is always stored in the DB.
// These functions are for display purposes only.

export function getDaysRemaining(deadlineDate) {
  const deadline = new Date(deadlineDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  deadline.setHours(0, 0, 0, 0)
  return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24))
}

export function getDeadlineStatus(daysRemaining) {
  if (daysRemaining > 60)  return 'green'
  if (daysRemaining > 30)  return 'amber'
  if (daysRemaining > 14)  return 'red'
  if (daysRemaining > 0)   return 'critical'
  return 'expired'
}

export function getDeadlineLabel(status) {
  const labels = {
    green:    'Monitor',
    amber:    'Action Soon',
    red:      'Urgent',
    critical: 'Critical',
    expired:  'Expired'
  }
  return labels[status] || 'Unknown'
}

export function formatDeadlineCountdown(daysRemaining) {
  if (daysRemaining < 0)  return 'Expired'
  if (daysRemaining === 0) return 'Due today'
  if (daysRemaining === 1) return '1 day remaining'
  return `${daysRemaining} days remaining`
}

export function formatDate(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export function getRiskLabel(rating) {
  const labels = {
    high:    'HIGH RISK',
    medium:  'MEDIUM RISK',
    low:     'LOW RISK',
    unknown: 'UNKNOWN — NOT SURVEYED'
  }
  return labels[rating] || 'UNKNOWN'
}

export function getRiskDescription(rating) {
  const descriptions = {
    high:    'Heritage sites within or adjacent to this tenement area.',
    medium:  'Tenement is near known significant areas or within a Dreaming track corridor.',
    low:     'No registered heritage sites in this area. Country has been surveyed.',
    unknown: 'This area has not been surveyed. Unknown does not mean safe. Heritage survey required.'
  }
  return descriptions[rating] || ''
}