// components/Watchtower/WatchtowerScreen.jsx
import { useState } from 'react'
import { useNotices } from '../../hooks/useNotices'
import { NoticeCard } from './NoticeCard'
import { DeadlineSummary } from './DeadlineSummary'

export function WatchtowerScreen() {
  const [filter, setFilter] = useState('active')
  const { notices, loading, error } = useNotices(filter)

  const urgentCount = notices.filter(n =>
    ['red', 'critical'].includes(n.deadline_status)
  ).length

  return (
    <div>
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="screen-header__title">Watchtower</h1>
            <p className="screen-header__subtitle">Section 29 notices on your Country</p>
          </div>
          {urgentCount > 0 && (
            <div style={{
              background: 'var(--status-critical)',
              color: 'white',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}>
              {urgentCount}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)'
        }}>
          {[
            { key: 'active', label: 'Active' },
            { key: 'urgent', label: '🔴 Urgent' },
            { key: 'all', label: 'All' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: filter === tab.key ? 'var(--accent)' : 'var(--bg-border)',
                background: filter === tab.key ? 'var(--accent-muted)' : 'transparent',
                color: filter === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                fontWeight: filter === tab.key ? 600 : 400,
                cursor: 'pointer',
                minHeight: 'var(--touch-min)',
                fontFamily: 'var(--font-sans)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingSkeleton />}

      {error && (
        <div style={{
          margin: 'var(--space-4)',
          padding: 'var(--space-4)',
          background: 'rgba(239,68,68,0.1)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--risk-high)',
          fontSize: 'var(--text-sm)'
        }}>
          Failed to load notices: {error}
        </div>
      )}

      {!loading && !error && notices.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🗺️</div>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            No notices on Country
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            The Watchtower is monitoring. You'll be notified when a section 29 notice is received.
          </p>
        </div>
      )}

      {!loading && notices.length > 0 && (
        <>
          <DeadlineSummary notices={notices} />
          <div className="notice-list">
            {notices.map(notice => (
              <NoticeCard key={notice.id} notice={notice} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="notice-list">
      {[1, 2, 3].map(i => (
        <div key={i} className="card loading-pulse" style={{ height: 120 }} />
      ))}
    </div>
  )
}
