async function loadAllWAPBCs(env) {
  const { data: allPBCs } = await supabase
    .from('pbcs')
    .select('id, name, determination_id, boundary, entity_type')
    .like('determination_id', 'WCD%')
    .not('boundary', 'is', null)

  if (!allPBCs?.length) return

  const features = allPBCs.map(pbc => ({
    type: 'Feature',
    geometry: pbc.boundary,
    properties: {
      name: pbc.name,
      determination_id: pbc.determination_id,
      entity_type: pbc.entity_type
    }
  }))

  map.current.addSource('all-wa-pbcs', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features }
  })

  map.current.addLayer({
    id: 'all-wa-pbcs-fill',
    type: 'fill',
    source: 'all-wa-pbcs',
    paint: {
      'fill-color': '#8b5cf6',
      'fill-opacity': 0.05
    }
  })

  map.current.addLayer({
    id: 'all-wa-pbcs-line',
    type: 'line',
    source: 'all-wa-pbcs',
    paint: {
      'line-color': '#8b5cf6',
      'line-width': 0.8,
      'line-opacity': 0.4
    }
  })

  // Popup on click
  map.current.on('click', 'all-wa-pbcs-fill', (e) => {
    const p = e.features[0].properties
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<div style="font-family:monospace;font-size:12px"><strong>${p.name}</strong><br/>${p.determination_id}<br/><em>${p.entity_type}</em></div>`)
      .addTo(map.current)
  })
}