import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function AuthMenu({ user }) {
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (!user) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: 'var(--text-sm)',
          color: 'var(--text-inverse)',
          flexShrink: 0
        }}
      >
        {user.email?.[0]?.toUpperCase() || 'K'}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 199
            }}
          />
          <div style={{
            position: 'absolute',
            top: 44,
            right: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            minWidth: 200,
            zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 'var(--space-3)',
              paddingBottom: 'var(--space-3)',
              borderBottom: '1px solid var(--bg-border)'
            }}>
              {user.email}
            </div>
            <button
              onClick={handleLogout}
              className="btn btn--danger btn--full"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}