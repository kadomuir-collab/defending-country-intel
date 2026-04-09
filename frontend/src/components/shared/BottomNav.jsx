// components/shared/BottomNav.jsx
import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { key: 'watchtower', path: '/watchtower', label: 'Watchtower', icon: WatchtowerIcon },
  { key: 'map', path: '/map', label: 'Country', icon: MapIcon },
  { key: 'heritage', path: '/heritage', label: 'Heritage', icon: HeritageIcon },
  { key: 'respond', path: '/respond', label: 'Respond', icon: RespondIcon }
]

export function BottomNav({ urgentCount = 0 }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 'var(--nav-height)',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--bg-border)',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)'
    }}>
      {NAV_ITEMS.map(item => {
        const active = location.pathname.startsWith(item.path)
        const IconComponent = item.icon
        const showBadge = item.key === 'watchtower' && urgentCount > 0

        return (
          <button
            key={item.key}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              position: 'relative',
              minHeight: 'var(--touch-min)',
              transition: 'color 0.15s'
            }}
          >
            <div style={{ position: 'relative' }}>
              <IconComponent size={22} active={active} />
              {showBadge && (
                <div style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
                  background: 'var(--status-critical)',
                  color: 'white',
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {urgentCount > 9 ? '9+' : urgentCount}
                </div>
              )}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              letterSpacing: '0.03em'
            }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function WatchtowerIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  )
}

function MapIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/>
      <line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  )
}

function HeritageIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="9"/>
      <line x1="12" y1="15" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="9" y2="12"/>
      <line x1="15" y1="12" x2="22" y2="12"/>
    </svg>
  )
}

function RespondIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}