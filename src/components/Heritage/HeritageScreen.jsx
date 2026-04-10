import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { HeritageUpload } from './HeritageUpload'

const SITE_TYPES = [
  { value: 'dreaming_site', label: 'Dreaming Site' },
  { value: 'dreaming_track', label: 'Dreaming Track / Songline' },
  { value: 'waterhole', label: 'Waterhole / Permanent Water' },
  { value: 'rock_art', label: 'Rock Art Site' },
  { value: 'burial_ground', label: 'Burial Ground / Ancestral Remains' },
  { value: 'ochre_deposit', label: 'Ochre Deposit' },
  { value: 'boundary_marker', label: 'Boundary Marker / Meeting Place' },
  { value: 'underground_dreaming', label: 'Underground Dreaming Area' },
  { value: 'ceremony_ground', label: 'Ceremony Ground' },
  { value: 'other', label: 'Other' }
]

const ACCESS_LEVELS = [
  { value: 'unrestricted', label: 'Unrestricted' },
  { value: 'gender_restricted_male', label: 'Male restricted' },
  { value: 'gender_restricted_female', label: 'Female restricted' },
  { value: 'knowledge_holder_only', label: 'Knowledge holders only' },
  { value: 'admin_only', label: 'Admin only' }
]

export function HeritageScreen() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    site_type: '',
    significance_assertion: '',
    access_restriction: 'unrestricted',
    verified_by: '',
    buffer_radius_m: 5000
  })

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data } = await supabase
      .from('heritage_sites')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    setSites(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.site_type || !form.significance_assertion || !form.verified_by) {
      alert('Please fill in all required fields.')
      return
    }
    setSaving(true)
    const { data: user } = await supabase.auth.getUser()
    const { data: staffData } = await supabase
      .from('staff').select('pbc_id')
      .eq('user_id', user.user.id).single()
    const { error } = await supabase
      .from('heritage_sites')
      .insert({ ...form, pbc_id: staffData.pbc_id })
    if (error) {
      alert('Failed: ' + error.message)
    } else {
      setShowForm(false)
      setForm({
        site_type: '',
        significance_assertion: '',
        access_restriction: 'unrestricted',
        verified_by: '',
        buffer_radius_m: 5000
      })
      fetchSites()
    }
    setSaving(false)
  }

  const label = (val) => SITE_TYPES.find(t => t.value === val)?.label || val

  return (
    <div style={{ paddingBottom: 'var(--nav-height)' }}>
      <div className="screen-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="screen-header__title">Heritage Register</h1>
            <p className="screen-header__subtitle">
              {sites.length} site{sites.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn btn--secondary"
              onClick={() => { setShowUpload(!showUpload); setShowForm(false) }}
              style={{ fontSize: 'var(--text-xs)', padding: '0 var(--space-3)' }}
            >
              {showUpload ? 'Cancel' : '↑ Bulk Upload'}
            </button>
            <button
              className="btn btn--primary"
              onClick={() => { setShowForm(!showForm); setShowUpload(false) }}
              style={{ fontSize: 'var(--text-xs)', padding: '0 var(--space-3)' }}
            >
              {showForm ? 'Cancel' : '+ Add Site'}
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <HeritageUpload onComplete={() => { fetchSites(); setShowUpload(false) }} />
      )}

      {showForm && (
        <div style={{ padding: 'var(--space-4)' }}>
          <div className="card">
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Site Type *
              </label>
              <select
                value={form.site_type}
                onChange={e => setForm({ ...form, site_type: e.target.value })}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 'var(--text-base)', minHeight: 'var(--touch-min)' }}
              >
                <option value="">Select...</option>
                {SITE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Significance Assertion *
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                State THAT it is significant - not WHY. (Top End 2025)
              </p>
              <textarea
                value={form.significance_assertion}
                onChange={e => setForm({ ...form, significance_assertion: e.target.value })}
                placeholder="This site is of special significance to our people in accordance with our traditions and laws."
                rows={3}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 'var(--text-base)', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Verified By *
              </label>
              <input
                type="text"
                value={form.verified_by}
                onChange={e => setForm({ ...form, verified_by: e.target.value })}
                placeholder="Knowledge holder name"
                style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 'var(--text-base)', minHeight: 'var(--touch-min)' }}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Access Restriction
              </label>
              <select
                value={form.access_restriction}
                onChange={e => setForm({ ...form, access_restriction: e.target.value })}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 'var(--text-base)', minHeight: 'var(--touch-min)' }}
              >
                {ACCESS_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 'var(--space-5)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Buffer Zone: {(form.buffer_radius_m / 1000).toFixed(1)}km
              </label>
              <input
                type="range"
                min={1000}
                max={20000}
                step={1000}
                value={form.buffer_radius_m}
                onChange={e => setForm({ ...form, buffer_radius_m: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <button
              className="btn btn--primary btn--full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save to Sovereign Register'}
            </button>
          </div>
        </div>
      )}

      {!loading && sites.length === 0 && !showForm && !showUpload && (
        <div className="empty-state">
          <div className="empty-state__icon">⭕</div>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No sites recorded yet</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Add heritage sites to enable crosscheck on notices.
          </p>
        </div>
      )}

      {!loading && sites.length > 0 && (
        <div className="notice-list">
          {sites.map(site => (
            <div key={site.id} className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--accent)', marginBottom: 4 }}>
                    {label(site.site_type)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Verified by {site.verified_by}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    {site.significance_assertion}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, marginLeft: 12, flexShrink: 0 }}>
                  {site.access_restriction.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Buffer: {(site.buffer_radius_m / 1000).toFixed(1)}km
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}