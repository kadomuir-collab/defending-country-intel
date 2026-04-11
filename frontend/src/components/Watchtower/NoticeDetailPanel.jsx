// components/Watchtower/NoticeDetailPanel.jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  getDaysRemaining,
  getDeadlineStatus,
  formatDeadlineCountdown,
  formatDate
} from '../../lib/deadline'

export function NoticeDetailPanel() {
  const { noticeId } = useParams()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!noticeId) return
    fetchNotice()
  }, [noticeId])

  async function fetchNotice() {
    setLoading(true)
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('id', noticeId)
      .single()
    setNotice(data)
    setLoading(false)
  }

  function handleViewOnMap() {
    // Store the notice geometry in sessionStorage so MapScreen can pick it up
    if (notice?.geometry) {
      const geom = typeof notice.geometry === 'string'
        ? notice.geometry
        : JSON.stringify(notice.geometry)
      sessionStorage.setItem('map_focus_geometry', geom)
      sessionStorage.setItem('map_focus_id', notice.id)
    }
    navigate('/map')
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--accent)'
        }}>
          Loading...
        </div>
      </div>
    )
  }

  if (!notice) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        Notice not found.
      </div>
    )
  }

  const daysRemaining = getDaysRemaining(notice.deadline_date)
  const status = notice.deadline_status || getDeadlineStatus(daysRemaining)

  const statusColors = {
    green:    'var(--status-green)',
    amber:    'var(--status-amber)',
    red:      'var(--status-red)',
    critical: 'var(--status-critical)',
    expired:  'var(--status-grey)',
    grey:     'var(--status-grey)',
  }
  const accentColor = statusColors[status] || 'var(--status-grey)'

  const stage = (notice.workflow_stage || '').replace(/_/g, ' ').toUpperCase()

  return (
    <div>
      {/* Header */}
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            onClick={() => navigate('/watchtower')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              padding: '4px 0',
              minHeight: 'var(--touch-min)',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            ← Back
          </button>
          <div>
            <h1 className="screen-header__title">
              {notice.tenement_type} {notice.tenement_number}
            </h1>
            <p className="screen-header__subtitle">{notice.grantee || 'Grantee not recorded'}</p>
          </div>
        </div>
      </div>

      <div style={{ padding: 'var(--space-4)' }}>

        {/* Deadline status hero */}
        <div style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${accentColor}`,
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: accentColor
            }}>
              {formatDeadlineCountdown(daysRemaining)}
            </div>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginTop: 4
            }}>
              Deadline {formatDate(notice.deadline_date)}
            </div>
          </div>
          <span className={`status-badge status-badge--${status}`}>
            {status.toUpperCase()}
          </span>
        </div>

        {/* Detail rows */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '0 var(--space-4)',
          marginBottom: 'var(--space-4)'
        }}>
          <DetailRow label="Tenement" value={`${notice.tenement_type || ''} ${notice.tenement_number || ''}`} />
          <DetailRow label="Applicant" value={notice.grantee || 'Not recorded'} />
          <DetailRow label="Notice type" value={stage || 'Unknown'} accent />
          <DetailRow label="Notified" value={formatDate(notice.notification_date) || 'Unknown'} />
          <DetailRow label="Deadline" value={formatDate(notice.deadline_date) || 'Unknown'} />
          {notice.shire && <DetailRow label="Location" value={notice.shire} />}
          {notice.source && <DetailRow label="Source" value={notice.source.toUpperCase()} />}
          {notice.government_party && <DetailRow label="Government party" value={notice.government_party} />}
        </div>

        {/* Domain knowledge note */}
        <div style={{
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.6
        }}>
          {notice.workflow_stage === 's29_issued' && (
            <>s29 notice — expedited procedure. You have 4 months from the notification date to object or become a registered native title party.</>
          )}
          {notice.workflow_stage === 's31_issued' && (
            <>s31 Right to Negotiate — mining lease. Minimum 6-month negotiation period. Formal engagement required.</>
          )}
          {notice.workflow_stage === 'early_warning' && (
            <>Early warning — application lodged with DMIRS. No formal NTA process yet. Monitor for progression to s29.</>
          )}
          {notice.workflow_stage === 'spatial_confirmed' && (
            <>Tenement geometry confirmed on Country. NNTT formal notice not yet issued. Monitor for s29 notification.</>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {notice.geometry && (
            <button
              className="btn btn--primary btn--full"
              onClick={handleViewOnMap}
            >
              🗺 View on Country Map
            </button>
          )}
          <button
            className="btn btn--secondary btn--full"
            onClick={() => navigate('/respond')}
          >
            📋 Response Toolkit
          </button>
        </div>

      </div>
    </div>
  )
}

function DetailRow({ label, value, accent }) {
  return (
    <div className="detail-row">
      <span className="detail-row__label">{label}</span>
      <span className="detail-row__value" style={accent ? { color: 'var(--accent)' } : {}}>
        {value}
      </span>
    </div>
  )
}