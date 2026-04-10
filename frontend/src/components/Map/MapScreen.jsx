import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../../lib/supabase'

export function MapScreen() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [loading, setLoading] = useState(true)
  const [pbcName, setPbcName] = useState('')
  const [noticeCount, setNoticeCount] = useState(0)

  useEffect(() => {
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [121.5, -28.5],
      zoom: 5
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', async () => {
      await loadPBCBoundary()
      await loadNotices()

      const { data: user } = await supabase.auth.getUser()
      const { data: staffData } = await supabase
        .from('staff')
        .select('role')
        .eq('user_id', user.user.id)
        .single()

      if (staffData?.role === 'superuser') {
        await loadAllWAPBCs()
      }

      setLoading(false)
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  async function loadPBCBoundary() {
    const { data: user } = await supabase.auth.getUser()
    const { data: staffData } = await supabase
      .from('staff')
      .select('pbc_id, pbcs(name, boundary)')
      .eq('user_id', user.user.id)
      .single()

    if (!staffData?.pbcs) return
    setPbcName(staffData.pbcs.name)
    if (!staffData.pbcs.boundary) return

    map.current.addSource('pbc-boundary', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: staffData.pbcs.boundary,
        properties: {}
      }
    })

    map.current.addLayer({
      id: 'pbc-fill',
      type: 'fill',
      source: 'pbc-boundary',
      paint: { 'fill-color': '#d97706', 'fill-opacity': 0.1 }
    })

    map.current.addLayer({
      id: 'pbc-line',
      type: 'line',
      source: 'pbc-boundary',
      paint: { 'line-color': '#d97706', 'line-width': 2, 'line-dasharray': [2, 2] }
    })

    const bounds = new maplibregl.LngLatBounds()
    const geom = staffData.pbcs.boundary
    if (geom.type === 'Polygon') {
      geom.coordinates[0].forEach(c => bounds.extend(c))
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(p => p[0].forEach(c => bounds.extend(c)))
    }
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 40 })
    }
  }

  async function loadNotices() {
    const { data: notices } = await supabase
      .from('notices')
      .select('*')
      .eq('status', 'active')

    if (!notices?.length) return
    setNoticeCount(notices.length)

    const features = notices
      .filter(n => n.geometry)
      .map(n => ({
        type: 'Feature',
        geometry: typeof n.geometry === 'string' ? JSON.parse(n.geometry) : n.geometry,
        properties: {
          id: n.id,
          tenement_number: n.tenement_number,
          tenement_type: n.tenement_type,
          deadline_status: n.deadline_status,
          grantee: n.grantee || 'Unknown'
        }
      }))

    if (!features.length) return

    map.current.addSource('notices', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    })

    map.current.addLayer({
      id: 'notices-fill',
      type: 'fill',
      source: 'notices',
      paint: {
        'fill-color': [
          'match', ['get', 'deadline_status'],
          'green', '#22c55e',
          'amber', '#f59e0b',
          'red', '#ef4444',
          'critical', '#ff1744',
          '#6b7280'
        ],
        'fill-opacity': 0.3
      }
    })

    map.current.addLayer({
      id: 'notices-line',
      type: 'line',
      source: 'notices',
      paint: {
        'line-color': [
          'match', ['get', 'deadline_status'],
          'green', '#22c55e',
          'amber', '#f59e0b',
          'red', '#ef4444',
          'critical', '#ff1744',
          '#6b7280'
        ],
        'line-width': 1.5
      }
    })

    map.current.on('click', 'notices-fill', (e) => {
      const p = e.features[0].properties
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML('<div style="font-family:monospace;font-size:12px"><strong>' + p.tenement_type + ' ' + p.tenement_number + '</strong><br/>' + p.grantee + '</div>')
        .addTo(map.current)
    })

    map.current.on('mouseenter', 'notices-fill', () => {
      map.current.getCanvas().style.cursor = 'pointer'
    })
    map.current.on('mouseleave', 'notices-fill', () => {
      map.current.getCanvas().style.cursor = ''
    })
  }

  async function loadAllWAPBCs() {
    const { data: allPBCs } = await supabase
      .from('pbcs')
      .select('id, name, determination_id, boundary, entity_type')
      .like('determination_id', 'WCD%')
      .not('boundary', 'is', null)

    if (!allPBCs?.length) return

    const features = allPBCs
      .filter(pbc => pbc.boundary)
      .map(pbc => ({
        type: 'Feature',
        geometry: pbc.boundary,
        properties: {
          name: pbc.name,
          determination_id: pbc.determination_id,
          entity_type: pbc.entity_type
        }
      }))

    if (!features.length) return

    map.current.addSource('all-wa-pbcs', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    })

    map.current.addLayer({
      id: 'all-wa-pbcs-fill',
      type: 'fill',
      source: 'all-wa-pbcs',
      paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.05 }
    })

    map.current.addLayer({
      id: 'all-wa-pbcs-line',
      type: 'line',
      source: 'all-wa-pbcs',
      paint: { 'line-color': '#8b5cf6', 'line-width': 0.8, 'line-opacity': 0.5 }
    })

    map.current.on('click', 'all-wa-pbcs-fill', (e) => {
      const p = e.features[0].properties
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML('<div style="font-family:monospace;font-size:12px"><strong>' + p.name + '</strong><br/>' + p.determination_id + '<br/><em>' + p.entity_type + '</em></div>')
        .addTo(map.current)
    })

    map.current.on('mouseenter', 'all-wa-pbcs-fill', () => {
      map.current.getCanvas().style.cursor = 'pointer'
    })
    map.current.on('mouseleave', 'all-wa-pbcs-fill', () => {
      map.current.getCanvas().style.cursor = ''
    })
  }

  const legendItems = [
    { color: '#22c55e', label: 'Monitor' },
    { color: '#f59e0b', label: 'Amber' },
    { color: '#ef4444', label: 'Urgent' },
    { color: '#ff1744', label: 'Critical' },
    { color: '#d97706', label: 'Your Country', dashed: true },
    { color: '#8b5cf6', label: 'WA PBCs', dashed: false }
  ]

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="screen-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="screen-header__title">Country Map</h1>
            <p className="screen-header__subtitle">
              {pbcName || 'Loading...'} — {noticeCount} active notice{noticeCount !== 1 ? 's' : ''}
            </p>
          </div>
          {loading && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
              Loading...
            </div>
          )}
        </div>
      </div>

      <div ref={mapContainer} style={{ flex: 1, paddingBottom: 'var(--nav-height)' }} />

      <div style={{
        position: 'absolute',
        bottom: 'calc(var(--nav-height) + 16px)',
        left: 16,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        zIndex: 10
      }}>
        {legendItems.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 4, fontSize: 11,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)'
          }}>
            <div style={{
              width: 12, height: 12,
              background: item.dashed ? 'transparent' : item.color,
              border: '2px ' + (item.dashed ? 'dashed' : 'solid') + ' ' + item.color,
              borderRadius: 2, flexShrink: 0
            }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}