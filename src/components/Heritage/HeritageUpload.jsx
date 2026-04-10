import { useState, useRef } from 'react'
import { read, utils } from 'xlsx'
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
  const [stage, setStage] = useState('idle')
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [imported, setImported] = useState(0)
  const fileRef = useRef()

  function parseRows(rawRows) {
    const parsed = []
    const errs = []

    rawRows.forEach((row, i) => {
      // Skip comment rows and empty rows
      const firstVal = String(row.site_type || row['site_type *'] || '').trim()
      if (!firstVal || firstVal.startsWith('#') || firstVal === 'site_type' || firstVal === 'site_type *') return

      const site_type = (row.site_type || row['site_type *'] || '').toString().trim()
      const significance = (row.significance_assertion || row['significance_assertion *'] || '').toString().trim()
      const verified_by = (row.verified_by || row['verified_by *'] || '').toString().trim()
      const access = (row.access_restriction || 'unrestricted').toString().trim()
      const buffer = parseInt(row.buffer_radius_m || 5000)
      const lat = row.latitude ? parseFloat(row.latitude) : null
      const lng = row.longitude ? parseFloat(row.longitude) : null

      const rowErrors = []
      if (!site_type) rowErrors.push('site_type required')
      else if (!SITE_TYPES.includes(site_type)) rowErrors.push(`Invalid site_type: ${site_type}`)
      if (!significance) rowErrors.push('significance_assertion required')
      if (!verified_by) rowErrors.push('verified_by required')
      if (access && !ACCESS_LEVELS.includes(access)) rowErrors.push(`Invalid access_restriction: ${access}`)

      if (rowErrors.length > 0) {
        errs.push({ row: i + 2, errors: rowErrors })
      } else {
        parsed.push({
          site_type,
          significance_assertion: significance,
          verified_by,
          access_restriction: access || 'unrestricted',
          buffer_radius_m: isNaN(buffer) ? 5000 : buffer,
          latitude: lat,
          longitude: lng,
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
      const data = new Uint8Array(ev.target.result)
      const wb = read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows = utils.sheet_to_json(ws, { defval: '' })
      const { rows: parsed, errors: errs } = parseRows(rawRows)
      setRows(parsed)
      setErrors(errs)
      setStage('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setStage('importing')
    const { data: user } = await supabase.auth.getUser()
    const { data: staffData } = await supabase
      .from('staff').select('pbc_id')
      .eq('user_id', user.user.id).single()

    const records = rows.map(row => ({
      pbc_id: staffData.pbc_id,
      site_type: row.site_type,
      significance_assertion: row.significance_assertion,
      verified_by: row.verified_by,
      access_restriction: row.access_restriction,
      buffer_radius_m: row.buffer_radius_m,
    }))

    let count = 0
    for (let i = 0; i < records.length; i += 50) {
      const { error } = await supabase.from('heritage_sites').insert(records.slice(i, i + 50))
      if (!error) count += Math.min(50, records.length - i)
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
    <div style={{ margin: 'var(--space-4)' }}>
      <div className="card">
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--accent)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Bulk Upload from Spreadsheet
        </h3>

        {stage === 'idle' && (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              Upload an Excel (.xlsx) or CSV file prepared by your PBC. Download the template for the correct format — it includes dropdowns and instructions.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <a
                href="/heritage_register_template.xlsx"
                download
                className="btn btn--secondary"
              >
                ↓ Download Excel Template
              </a>
              <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
                ↑ Upload File
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
              Accepts .xlsx, .xls, or .csv files
            </p>
          </>
        )}

        {stage === 'preview' && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', color: rows.length > 0 ? 'var(--status-green)' : 'var(--status-grey)', marginBottom: 'var(--space-3)' }}>
              {rows.length} valid row{rows.length !== 1 ? 's' : ''} ready
            </div>
            {errors.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ color: 'var(--risk-high)', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 8 }}>
                  {errors.length} row{errors.length !== 1 ? 's' : ''} with errors — skipped:
                </div>
                {errors.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Row {e.row}: {e.errors.join(', ')}
                  </div>
                ))}
                {errors.length > 5 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>...and {errors.length - 5} more</div>
                )}
              </div>
            )}
            {rows.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr>
                      {['Site Type', 'Verified By', 'Access', 'Buffer'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>{h}</th>
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
          <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
            Importing to sovereign register...
          </div>
        )}

        {stage === 'done' && (
          <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', color: 'var(--status-green)', marginBottom: 8 }}>
              ✓ {imported} site{imported !== 1 ? 's' : ''} imported
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              Saved to your sovereign register.
            </p>
            <button className="btn btn--secondary" onClick={reset}>Upload another file</button>
          </div>
        )}
      </div>
    </div>
  )
}