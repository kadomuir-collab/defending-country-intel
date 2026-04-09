// pages/AuthPage.jsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: 'var(--space-6)',
      background: 'var(--bg-base)'
    }}>
      <div style={{ marginBottom: 'var(--space-10)', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--accent)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-3)'
        }}>
          Dilji Labs
        </div>
        <h1 style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          marginBottom: 'var(--space-2)'
        }}>
          Defending Country Intel
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)'
        }}>
          Section 29 intelligence for Country
        </p>
      </div>

      <div className="card" style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-2)'
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{
              width: '100%',
              padding: '12px var(--space-4)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--bg-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              minHeight: 'var(--touch-min)'
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-2)'
          }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '12px var(--space-4)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--bg-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              minHeight: 'var(--touch-min)'
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: 'var(--space-3)',
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--risk-high)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-4)'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="btn btn--primary btn--full"
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      <p style={{
        textAlign: 'center',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        marginTop: 'var(--space-8)'
      }}>
        Access restricted to registered PBC staff.
        <br />
        Contact your PBC administrator to request access.
      </p>
    </div>
  )
}