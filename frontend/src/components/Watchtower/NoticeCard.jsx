// components/Watchtower/NoticeCard.jsx
import { useNavigate } from 'react-router-dom'
import {
  getDaysRemaining,
  getDeadlineStatus,
  formatDeadlineCountdown,
  formatDate,
  getRiskLabel
} from '../../lib/deadline'

export function NoticeCard({ notice }) {
  const navigate = useNavigate()
  const daysRemaining = getDaysRemaining(notice.deadline_date)
  const status = notice.deadline_status || getDeadlineStatus(daysRemaining)

  const statusColors = {
    green:    'var(--status-green)',
    amber:    'var(--status-amber)',
    red:      'var(--status-red)',
    critical: 'var(--status-critical)',
    expired:  'var(--status-grey)'
  }

  const accentColor = statusColors[status] || 'var(--status-grey)'

  return (
    <div
      className="card"
      onClick={() => navigate(`/watchtower/${notice.id}`)}
      style={{
        cursor: 'pointer',
        borderLeft: `3px solid ${accentColor}`,
        padding: 'var(--space-4)'
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3)'
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--accent)',
            fontWeight: 500,
            marginBottom: 'var(--space-1)'
          }}>
            {notice.tenement_type} {notice.tenement_number}
          </div>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)'
          }}>
            {notice.grantee || 'Grantee not recorded'}
          </div>
        </div>
        <span className={`risk-badge risk-badge--${notice.risk_rating || 'unknown'}`}>
          {getRiskLabel(notice.risk_rating || 'unknown').split(' ')[0]}
        </span>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-lg)',
            fontWeight: 500,
            color: accentColor
          }}>
            {formatDeadlineCountdown(daysRemaining)}
          </div>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: 2
          }}>
            Notified {formatDate(notice.notification_date)} · Deadline {formatDate(notice.deadline_date)}
          </div>
        </div>
        <span className={`status-badge status-badge--${status}`}>
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}