// components/Heritage/HeritageUpload.jsx
import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SITE_TYPES = [
  'dreaming_site', 'dreaming_track', 'waterhole', 'rock_art',
  'burial_ground', 'ochre_deposit', 'boundary_marker',
  'underground_dreaming', 'ceremony_ground', 'other'
]

const ACCESS_LEVELS = [
  'unrestricted', 'gender_restricted_male', 'gender_restricted_female',
  'knowledge_holder_only', 'admin_only'
]

export function HeritageUpload({ onComplete }) {
  const [stage, setStage] = useState('idle') // idle, preview, importing, done
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [imported, setImported] = useState(0)
  const fileRef = useRef()

  function downloadTemplate() {
    const headers = [
      'site_type',
      'significance_assertion',
      'verified_by',
      'access_restriction',
      'buffer_radius_m',
      'location_precision',
      'latitude',
      'longitude'
    ]
    const example = [
      'dreaming_site',
      'This site is of special significance to our people in accordance with our traditions and laws.',
      'Elder Name',
      'unrestricted',
      '5000',
      'approximate',
      '',
      ''
    ]
    const notes = [
      '# site_type options: dreaming_site / dreaming_track / waterhole / rock_art / burial_ground / ochre_deposit / boundary_marker / underground_dreaming / ceremony_ground / other',
      '# access_restriction options: unrestricted / gender_restricted_male / gender_restricted_female / knowledge_holder_only / admin_only',
      '# significance_assertion: State THAT the site is significant — not WHY (Top End 2025)',
      '# latitude/longitude: optional — leave blank if not disclosing location',
      '# buffer_radius_m: metres around site that triggers risk flag (default 5000)'
    ]

    const csv = [
      notes.join('\n'),
      headers.join(','),
      example.map(v => `"${v}"`).join(',')
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'heritage_register_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    if (lines.length < 2) return { rows: [], errors: ['File appears empty or has no data rows.'] }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
    const dataRows = lines.slice(1)
    const parsed = []
    const errs = []

    dataRows.forEach((line, i) => {
      if (!line.trim()) return
      const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || []
      const row = {}
      headers.forEach((h, j) => {
        row[h] = (values[j] || '').replace(/"/g, '').trim()
      })

      const rowErrors = []

      // Validate required fields
      if (!row.site_type) rowErrors.push('site_type is required')
      else if (!SITE_TYPES.includes(row.site_type)) {
        rowErrors.push(`Invalid site_type: "${row.site_type}"`)
      }

      if (!row.significance_assertion) rowErrors.push('significance_assertion is required')
      if (!row.verified_by) rowErrors.push('verified_by is required')

      if (row.access_restriction && !ACCESS_LEVELS.includes(row.access_restriction)) {
        rowErrors.push(`Invalid access_restriction: "${row.access_restriction}"`)
      }

      if (rowErrors.length > 0) {
        errs.push({ row: i + 2, errors: rowErrors })
      } else {
        parsed.push({
          site_type: row.site_type,
          significance_assertion: row.significance_assertion,
          verified_by: row.verified_by,
          access_restriction: row.access_restriction || 'unrestricted',
          buffer_radius_m: parseInt(row.buffer_radius_m) || 5000,
          location_precision: row.location_precision || 'approximate',
          latitude: row.latitude ? parseFloat(row.latitude) : null,
          longitude: row.longitude ? parseFloat(row.longitude) : null,
        })
      }
    })

    return { rows: parsed, errors: errs }
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const { rows: parsed, errors: errs } = parseCSV(ev.target.result)
      setRows(parsed)
      setErrors(errs)
      setStage('preview')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setStage('importing')

    const { data: user } = await supabase.auth.getUser()
    const { data: staffData } = await supabase
      .from('staff')
      .select('pbc_id')
      .eq('user_id', user.user.id)
      .single()

    const records = rows.map(row => {
      const record = {
        pbc_id: staffData.pbc_id,
        site_type: row.site_type,
        significance_assertion: row.significance_assertion,
        verified_by: row.verified_by,
        access_restriction: row.access_restriction,
        buffer_radius_m: row.buffer_radius_m,
        location_precision: row.location_precision,
      }

      // Add geometry if lat/lon provided
      if (row.latitude && row.longitude) {
        record.location = `POINT(${row.longitude} ${row.latitude})`
      }

      return record
    })

    // Insert in batches of 50
    let count = 0
    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50)
      const { error } = await supabase
        .from('heritage_sites')
        .insert(batch)

      if (!error) count += batch.length
    }

    setImported(count)
    setStage('done')
    if (onComplete) onComplete()
  }

  function reset() {
    setStage('idle')
    setRows([])
    setErrors([])
    setImported(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card" style={{ margin: 'var(--space-4)' }}>
      <h3 style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: 'var(--accent)',
        marginBottom: 'var(--space-4)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em'
      }}>
        Bulk Upload from Spreadsheet
      </h3>

      {stage === 'idle' && (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Upload a CSV spreadsheet prepared by your PBC. Download the template to see the correct format.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button className="btn btn--secondary" onClick={downloadTemplate}>
              ↓ Download Template
            </button>
            <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
              ↑ Upload CSV
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </>
      )}

      {stage === 'preview' && (
        <>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg)',
              color: rows.length > 0 ? 'var(--status-green)' : 'var(--status-grey)',
              marginBottom: 'var(--space-2)'
            }}>
              {rows.length} valid row{rows.length !== 1 ? 's' : ''} ready to import
            </div>
            {errors.length > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                marginBottom: 'var(--space-3)'
              }}>
                <div style={{ color: 'var(--risk-high)', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  {errors.length} row{errors.length !== 1 ? 's' : ''} with errors — will be skipped:
                </div>
                {errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Row {e.row}: {e.errors.join(', ')}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview table */}
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr>
                    {['Site Type', 'Verified By', 'Access', 'Buffer'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '6px 8px',
                        borderBottom: '1px solid var(--bg-border)',
                        color: 'var(--text-secondary)'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px', color: 'var(--accent)' }}>{row.site_type}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{row.verified_by}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{row.access_restriction}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{(row.buffer_radius_m / 1000).toFixed(1)}km</td>
                    </tr>
                  ))}
                  {rows.length > 10 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '6px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        ...and {rows.length - 10} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn--secondary" onClick={reset}>Cancel</button>
            {rows.length > 0 && (
              <button className="btn btn--primary" onClick={handleImport}>
                Import {rows.length} Site{rows.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </>
      )}

      {stage === 'importing' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
            Importing to sovereign register...
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xl)',
            color: 'var(--status-green)',
            marginBottom: 'var(--space-2)'
          }}>
            ✓ {imported} site{imported !== 1 ? 's' : ''} imported
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Saved to your sovereign register.
          </p>
          <button className="btn btn--secondary" onClick={reset}>Upload another file</button>
        </div>
      )}
    </div>
  )
}