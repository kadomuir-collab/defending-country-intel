// components/Heritage/HeritageScreen.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

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
  { value: 'unrestricted', label: 'Unrestricted — all staff' },
  { value: 'gender_restricted_male', label: 'Male restricted' },
  { value: 'gender_restricted_female', label: 'Female restricted' },
  { value: 'knowledge_holder_only', label: 'Knowledge holders only' },
  { value: 'admin_only', label: 'Admin only' }
]

export function HeritageScreen() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    site_type: '',
    significance_assertion: '',
    access_restriction: 'unrestricted',
    verified_by: '',
    location_precision: 'approximate',
    buffer_radius_m: 5000
  })

  useEffect(() => {
    fetchSites()
  }, [])

  async function fetchSites() {
    setLoading(true)
    const { data, error } = await supabase
      .from('heritage_sites')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (!error) setSites(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.site_type || !form.significance_assertion || !form.verified_by) {
      alert('Please fill in all required fields.')
      return
    }

    setSaving(true)

    const { data: staffData } = await supabase
      .from('staff')
      .select('pbc_id')
      .eq('user_id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const { error } = await supabase
      .from('heritage_sites')
      .insert({
        ...form,
        pbc_id: staffData.pbc_id
      })

    if (error) {
      alert('Failed to save: ' + error.message)
    } else {
      setShowForm(false)
      setForm({
        site_type: '',
        significance_assertion: '',
        access_restriction: 'unrestricted',
        verified_by: '',
        location_precision: 'approximate',
        buffer_radius_m: 5000
      })
      fetchSites()
    }
    setSaving(false)
  }

  const siteTypeLabel = (val) => SITE_TYPES.find(t => t.value === val)?.label || val

  return (
    <div>
      <div className="screen-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="screen-header__title">Heritage Register</h1>
            <p className="screen-header__subtitle">
              Sovereign cultural register — {sites.length} site{sites.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => setShowForm(!showForm)}
            style={{ minWidth: 80 }}
          >
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Add Site Form */}
      {showForm && (
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--bg-border)' }}>
          <div className="card">
            <h3 style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--accent)',
              marginBottom: 'var(--space-4)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Record Heritage Site
            </h3>

            {/* Site Type */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Site Type *
              </label>
              <select
                value={form.site_type}
                onChange={e => setForm({ ...form, site_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px var(--space-4)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  borderRadius: 'var(--radius-md)',
                  color: form.site_type ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 'var(--text-base)',
                  fontFamily: 'var(--font-sans)',
                  minHeight: 'var(--touch-min)'
                }}
              >
                <option value="">Select site type...</option>
                {SITE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Significance Assertion */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Significance Assertion *
              </label>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                State that this site is significant — not why it is significant. (Top End 2025)
              </p>
              <textarea
                value={form.significance_assertion}
                onChange={e => setForm({ ...form, significance_assertion: e.target.value })}
                placeholder="e.g. This site is of special significance to the Waturta people in accordance with their traditions and laws."
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px var(--space-4)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  fontFamily: 'var(--font-sans)',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Verified By */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Verified By (Knowledge Holder) *
              </label>
              <input
                type="text"
                value={form.verified_by}
                onChange={e => setForm({ ...form, verified_by: e.target.value })}
                placeholder="Name of knowledge holder affirming significance"
                style={{
                  width: '100%',
                  padding: '12px var(--space-4)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  fontFamily: 'var(--font-sans)',
                  minHeight: 'var(--touch-min)'
                }}
              />
            </div>

            {/* Access Restriction */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Access Restriction
              </label>
              <select
                value={form.access_restriction}
                onChange={e => setForm({ ...form, access_restriction: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px var(--space-4)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  fontFamily: 'var(--font-sans)',
                  minHeight: 'var(--touch-min)'
                }}
              >
                {ACCESS_LEVELS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            {/* Buffer Radius */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                Buffer Zone: {(form.buffer_radius_m / 1000).toFixed(1)}km
              </label>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                Tenements within this radius will trigger a risk flag even if precise coordinates are not disclosed.
              </p>
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
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving...' : 'Save to Sovereign Register'}
            </button>

            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 'var(--space-3)'
            }}>
              This record is stored in your PBC's sovereign register. Dilji Labs cannot access individual site records.
            </p>
          </div>
        </div>
      )}

      {/* Site List */}
      {loading && (
        <div className="notice-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="card loading-pulse" style={{ height: 80 }} />
          ))}
        </div>
      )}

      {!loading && sites.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-state__icon">⭕</div>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            No sites recorded yet
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Add heritage sites to your sovereign register to enable heritage crosscheck on notices.
          </p>
        </div>
      )}

      {!loading && sites.length > 0 && (
        <div className="notice-list">
          {sites.map(site => (
            <div key={site.id} className="card" style={{
              borderLeft: '3px solid var(--accent)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--accent)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-1)'
                  }}>
                    {siteTypeLabel(site.site_type)}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Verified by {site.verified_by}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    {site.significance_assertion}
                  </div>
                </div>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  marginLeft: 'var(--space-3)',
                  flexShrink: 0
                }}>
                  {site.access_restriction.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{
                marginTop: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)'
              }}>
                Buffer: {(site.buffer_radius_m / 1000).toFixed(1)}km
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}