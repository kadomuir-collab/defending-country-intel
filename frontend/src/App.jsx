// App.jsx
import { NyimuLoader } from './components/shared/NyimuLoader'
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { BottomNav } from './components/shared/BottomNav'
import { AuthPage } from './pages/AuthPage'
import { WatchtowerScreen } from './components/Watchtower/WatchtowerScreen'
import './styles/globals.css'
import { MapScreen } from './components/Map/MapScreen'
import { HeritageScreen } from './components/Heritage/HeritageScreen'

function RespondScreen() {
  return (
    <div>
      <div className="screen-header">
        <h1 className="screen-header__title">Respond</h1>
        <p className="screen-header__subtitle">Response toolkit &amp; Form 4</p>
      </div>
      <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>📋</div>
        <p>Response toolkit — Phase 3</p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  // Loading state
  if (session === undefined) {
    return (
     <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)'
    }}>
      <NyimuLoader message="Nyimu is waking up..." />
    </div>
    )
  }

  // Not authenticated
  if (!session) {
    return <AuthPage />
  }

  // Authenticated
  return (
    <BrowserRouter>
      <div id="root">
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/watchtower" replace />} />
            <Route path="/watchtower" element={<WatchtowerScreen />} />
            <Route path="/watchtower/:noticeId" element={<WatchtowerScreen />} />
            <Route path="/map" element={<MapScreen />} />
            <Route path="/heritage" element={<HeritageScreen />} />
            <Route path="/respond" element={<RespondScreen />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
