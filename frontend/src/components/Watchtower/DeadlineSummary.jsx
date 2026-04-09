// components/Watchtower/DeadlineSummary.jsx
export function DeadlineSummary({ notices }) {
  const counts = {
    critical: notices.filter(n => n.deadline_status === 'critical').length,
    red:      notices.filter(n => n.deadline_status === 'red').length,
    amber:    notices.filter(n => n.deadline_status === 'amber').length,
    green:    notices.filter(n => n.deadline_status === 'green').length,
  }

  if (!notices.length) return null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'var(--space-2)',
      padding: 'var(--space-4)',
      borderBottom: '1px solid var(--bg-border)'
    }}>
      <SummaryCell count={counts.critical} label="Critical" color="var(--status-critical)" />
      <SummaryCell count={counts.red}      label="Urgent"   color="var(--status-red)" />
      <SummaryCell count={counts.amber}    label="Amber"    color="var(--status-amber)" />
      <SummaryCell count={counts.green}    label="Monitor"  color="var(--status-green)" />
    </div>
  )
}

function SummaryCell({ count, label, color }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: 'var(--space-3)',
      background: count > 0 ? `${color}18` : 'var(--bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${count > 0 ? color + '40' : 'var(--bg-border)'}`
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xl)',
        fontWeight: 500,
        color: count > 0 ? color : 'var(--text-muted)',
        lineHeight: 1
      }}>
        {count}
      </div>
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        marginTop: 'var(--space-1)'
      }}>
        {label}
      </div>
    </div>
  )
}