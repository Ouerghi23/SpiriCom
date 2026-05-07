// src/pages/ComplaintMap.jsx
// ─────────────────────────────────────────────────────────────────────
// Professional interactive map of Tunisia using Leaflet (100% FREE, no API key)
// Features: heatmap, clustered markers, choropleth, service filter,
//           top 10 side panel, QoE overlay
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import 'leaflet.heat'
import ReactApexChart from 'react-apexcharts'
import { PageHeader, SectionHeader, Card, Badge, Spinner } from '../components/UI'
import { analyticsApi } from '../api/client'

// ── CONFIG ────────────────────────────────────────────────────────────
const TUNISIA_CENTER = [33.8869, 9.5375]
const TUNISIA_ZOOM   = 7

const C = { red: '#CF0A2C', blue: '#1A73E8', green: '#0F9D58', amber: '#F59E0B', gray: '#6B7280' }

// QoE color scale (red = bad, green = good)
const QOE_COLOR = (score) => {
  if (score < 50) return '#DC2626'
  if (score < 65) return '#F59E0B'
  if (score < 80) return '#FBBF24'
  if (score < 90) return '#84CC16'
  return '#16A34A'
}

const SERVICE_OPTIONS = [
  { id: 'all',   label: 'All Services', icon: '⚡', color: C.gray  },
  { id: '4g',    label: '4G Data',      icon: '📱', color: C.blue  },
  { id: 'voice', label: 'Voice',        icon: '📞', color: C.green },
  { id: 'sms',   label: 'SMS',          icon: '💬', color: C.amber },
]

// Free dark tile from CartoDB
const TILE_LAYER_DARK   = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_LAYER_LIGHT  = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION  = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

// ── MOCK DATA ─────────────────────────────────────────────────────────


// Custom marker icon (circular, colored by QoE)
const buildIcon = (size, color, label) => L.divIcon({
  className: 'custom-marker',
  html: `
    <div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 3px solid #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
      color: white; font-weight: 700;
      font-size: ${size > 30 ? 11 : 9}px;
      font-family: system-ui;
    ">${label || ''}</div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
})

// ── MAIN PAGE ─────────────────────────────────────────────────────────
export default function ComplaintMap() {
  const mapContainer = useRef(null)
  const map          = useRef(null)
  const layerGroup   = useRef(null)
  const heatLayer    = useRef(null)

  const [cities,      setCities]      = useState([])
  const [regions,     setRegions]     = useState([])  // ← AJOUTER
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [service,     setService]     = useState('all')
  const [viewMode,    setViewMode]    = useState('clusters')
  const [showQoE,     setShowQoE]     = useState(true)
  const [selectedCity,setSelectedCity]= useState(null)
  const [mapReady,    setMapReady]    = useState(false)

  // ── Fetch data ──────────────────────────────────────────────────────
useEffect(() => {
  const fetchData = async () => {
    try {
      const [cityRes, regionRes] = await Promise.all([
        analyticsApi.complaintsByCity(),
        analyticsApi.complaintsByRegion(),  // ← AJOUTÉ
      ])
      
      if (cityRes.data?.cities?.length > 0) {
        setCities(cityRes.data.cities)
      } else {
        setCities([])
        setError('No city data available')
      }
      
      if (regionRes.data?.regions?.length > 0) {
        setRegions(regionRes.data.regions)  // ← AJOUTÉ
      }
    } catch (err) {
      console.error('Map fetch error:', err)
      setCities([])
      setRegions([])
      setError('FastAPI offline — please start backend on port 8000')
    } finally {
      setLoading(false)
    }
  }
  fetchData()
}, [])

  // ── Filtered / computed data ────────────────────────────────────────
  const enrichedCities = useMemo(() => {
    return cities.map(c => ({
      ...c,
      filteredComplaints: service === 'all' ? c.complaints : (c.services?.[service] || 0),
    }))
  }, [cities, service])

  const totals = useMemo(() => {
    const total    = enrichedCities.reduce((s, c) => s + c.filteredComplaints, 0)
    const avgQoE   = enrichedCities.length
      ? (enrichedCities.reduce((s, c) => s + (c.qoe || 0), 0) / enrichedCities.length).toFixed(1)
      : 0
    const worstCity = [...enrichedCities].sort((a, b) => a.qoe - b.qoe)[0]
    const peakCity  = [...enrichedCities].sort((a, b) => b.filteredComplaints - a.filteredComplaints)[0]
    return { total, avgQoE, worstCity, peakCity, citiesCount: enrichedCities.length }
  }, [enrichedCities])

  const top10 = useMemo(
    () => [...enrichedCities].sort((a, b) => b.filteredComplaints - a.filteredComplaints).slice(0, 10),
    [enrichedCities]
  )

  // ── Init Leaflet ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = L.map(mapContainer.current, {
      center: TUNISIA_CENTER,
      zoom: TUNISIA_ZOOM,
      zoomControl: false,
      attributionControl: true,
    })

    L.tileLayer(TILE_LAYER_DARK, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map.current)

    L.control.zoom({ position: 'topright' }).addTo(map.current)
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map.current)

    setMapReady(true)

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // ── Render data layers ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !map.current || !enrichedCities.length) return
    const m = map.current

    // Clear previous layers
    if (layerGroup.current) {
      m.removeLayer(layerGroup.current)
      layerGroup.current = null
    }
    if (heatLayer.current) {
      m.removeLayer(heatLayer.current)
      heatLayer.current = null
    }


    // ── HEATMAP MODE ──────────────────────────────────────────────────
    if (viewMode === 'heatmap') {
      const maxValue = Math.max(...enrichedCities.map(c => c.filteredComplaints))
      const heatPoints = enrichedCities.map(c => [
        c.lat, c.lng, c.filteredComplaints / maxValue,
      ])
      heatLayer.current = L.heatLayer(heatPoints, {
        radius: 50,
        blur: 35,
        maxZoom: 12,
        max: 1.0,
        gradient: {
          0.2: '#3B82F6',
          0.4: '#22C55E',
          0.6: '#F59E0B',
          0.8: '#EF4444',
          1.0: '#CF0A2C',
        },
      }).addTo(m)
      return
    }

    // ── CLUSTERS MODE ─────────────────────────────────────────────────
    if (viewMode === 'clusters') {
      layerGroup.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        iconCreateFunction: (cluster) => {
          const sum = cluster.getAllChildMarkers()
            .reduce((s, m) => s + (m.options.complaints || 0), 0)
          const size = sum > 15000 ? 56 : sum > 5000 ? 44 : 36
          const color = sum > 15000 ? '#CF0A2C' : sum > 5000 ? '#F59E0B' : '#3B82F6'
          return L.divIcon({
            className: 'cluster-marker',
            html: `
              <div style="
                width: ${size}px; height: ${size}px;
                background: ${color};
                border: 3px solid #fff;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 16px rgba(0,0,0,.5);
                color: white; font-weight: 800;
                font-size: ${size > 50 ? 13 : 11}px;
                font-family: system-ui;
              ">${sum.toLocaleString()}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          })
        },
      })

      enrichedCities.forEach(c => {
        const radius = c.filteredComplaints > 5000 ? 24
                     : c.filteredComplaints > 2000 ? 18
                     : c.filteredComplaints > 500  ? 14 : 10
        const color = showQoE ? QOE_COLOR(c.qoe) : C.red
        const marker = L.marker([c.lat, c.lng], {
          icon: buildIcon(radius * 1.4, color, ''),
          complaints: c.filteredComplaints,
        })
        marker.bindPopup(buildPopup(c))
        marker.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(marker)
      })

      m.addLayer(layerGroup.current)
      return
    }

    // ── CHOROPLETH MODE ───────────────────────────────────────────────
    if (viewMode === 'choropleth') {
      layerGroup.current = L.layerGroup()
      const maxComplaints = Math.max(...enrichedCities.map(c => c.filteredComplaints))

      enrichedCities.forEach(c => {
        const intensity = c.filteredComplaints / maxComplaints
        const color = intensity > .8 ? '#CF0A2C'
                    : intensity > .5 ? '#EF4444'
                    : intensity > .3 ? '#F59E0B'
                    : intensity > .15 ? '#22C55E'
                    : '#3B82F6'
        const radius = 15 + intensity * 50

        const circle = L.circle([c.lat, c.lng], {
          radius: radius * 1000,
          color: color,
          fillColor: color,
          fillOpacity: 0.35,
          weight: 1.5,
        })
        circle.bindPopup(buildPopup(c))
        circle.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(circle)

        // Label marker
        const label = L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            className: 'city-label',
            html: `
              <div style="
                background: rgba(15,23,42,.85);
                color: white;
                padding: 4px 10px;
                border-radius: 6px;
                border: 1px solid ${color};
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
                font-family: system-ui;
                pointer-events: none;
              ">${c.city}<br/>
              <span style="font-weight: 400; font-size: 10px; opacity: .7;">${c.filteredComplaints.toLocaleString()}</span>
              </div>`,
            iconSize: [80, 40],
            iconAnchor: [40, 20],
          }),
        })
        layerGroup.current.addLayer(label)
      })

      m.addLayer(layerGroup.current)
    }
  }, [mapReady, enrichedCities, viewMode, showQoE])

  // ── Build popup HTML ────────────────────────────────────────────────
  const buildPopup = (c) => `
    <div style="font-family: system-ui; padding: 4px; min-width: 220px;">
      <div style="font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 4px;">
        ${c.city}
      </div>
      <div style="font-size: 11px; color: #6B7280; margin-bottom: 12px;">
        ${c.region}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div style="background: #FEF2F2; padding: 8px; border-radius: 6px;">
          <div style="font-size: 9px; color: #991B1B; font-weight: 700; letter-spacing: 1.5px;">COMPLAINTS</div>
          <div style="font-size: 16px; color: #CF0A2C; font-weight: 700;">${c.filteredComplaints.toLocaleString()}</div>
        </div>
        <div style="background: ${c.qoe < 65 ? '#FEF2F2' : c.qoe < 80 ? '#FFFBEB' : '#F0FDF4'};
                    padding: 8px; border-radius: 6px;">
          <div style="font-size: 9px; color: #6B7280; font-weight: 700; letter-spacing: 1.5px;">QoE SCORE</div>
          <div style="font-size: 16px; color: ${QOE_COLOR(c.qoe)}; font-weight: 700;">${c.qoe.toFixed(1)}</div>
        </div>
      </div>
      <div style="font-size: 11px; color: #6B7280;">
        Total all services: <strong>${c.complaints.toLocaleString()}</strong>
      </div>
    </div>
  `

  // Top 10 chart
  const top10Chart = {
    series: [{ name: 'Complaints', data: top10.map(c => c.filteredComplaints) }],
    options: {
      chart: { type: 'bar', toolbar: { show: false }, foreColor: '#9CA3AF' },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '70%' } },
      colors: [C.red],
      dataLabels: { enabled: true, style: { fontSize: '10px', colors: ['#fff'] }, formatter: (v) => v.toLocaleString() },
      xaxis: { categories: top10.map(c => c.city), labels: { style: { fontSize: '10px' } } },
      grid: { borderColor: 'rgba(255,255,255,.05)' },
    },
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#0F172A', minHeight: '100vh', color: '#E2E8F0' }}>
      <style>{`
        .leaflet-container { background: #0F172A !important; font-family: system-ui; }
        .leaflet-control-zoom a { background: rgba(15,23,42,.92) !important; color: #E2E8F0 !important; border-color: rgba(255,255,255,.1) !important; }
        .leaflet-control-zoom a:hover { background: #CF0A2C !important; color: #fff !important; }
        .leaflet-control-attribution { background: rgba(15,23,42,.85) !important; color: rgba(226,232,240,.5) !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: rgba(226,232,240,.7) !important; }
        .leaflet-popup-content-wrapper { background: #fff; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
        .leaflet-popup-tip { background: #fff; }
        .leaflet-control-scale-line { background: rgba(15,23,42,.85) !important; color: #E2E8F0 !important; border-color: rgba(255,255,255,.2) !important; }
        .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background: transparent !important; }
        .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div { background: transparent !important; }
      `}</style>

      <div className="p-6">
        <PageHeader
          title="Complaint Map — Tunisia"
          subtitle="Interactive geographic analysis · 24 gouvernorats · Real-time KPI overlay"
          badges={['Leaflet', `${cities.length} cities`, 'Free OpenStreetMap']}
        />

        {error && (
          <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13, color: '#FCD34D' }}>
            ⚠ {error}
          </div>
        )}

        {/* ── KPI tiles ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Complaints',    value: totals.total.toLocaleString(),     sub: SERVICE_OPTIONS.find(s=>s.id===service)?.label,                              color: C.red    },
            { label: 'Avg QoE Score',       value: totals.avgQoE,                     sub: 'Across all regions',                                                          color: '#22D3EE' },
            { label: 'Worst QoE City',      value: totals.worstCity?.city || '—',     sub: `${(totals.worstCity?.qoe || 0).toFixed(1)} score`,                            color: '#F97316' },
            { label: 'Peak Complaint City', value: totals.peakCity?.city || '—',      sub: `${(totals.peakCity?.filteredComplaints||0).toLocaleString()} complaints`,    color: C.amber  },
          ].map((t, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '18px 20px', borderTop: `2px solid ${t.color}` }}>
              <div style={{ fontSize: 10, color: 'rgba(226,232,240,.45)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{t.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: t.color, lineHeight: 1, marginBottom: 6 }}>{t.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(226,232,240,.4)' }}>{t.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,.06)', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'clusters',    label: 'Markers',    icon: '🔴' },
              { id: 'heatmap',     label: 'Heatmap',    icon: '🌡️' },
              { id: 'choropleth',  label: 'Choropleth', icon: '🗺️' },
            ].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)}
                style={{
                  background: viewMode === v.id ? '#CF0A2C' : 'transparent',
                  color: viewMode === v.id ? '#fff' : 'rgba(226,232,240,.6)',
                  border: 'none', padding: '8px 16px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s',
                }}>
                <span>{v.icon}</span> {v.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,.06)', padding: 3, borderRadius: 8 }}>
            {SERVICE_OPTIONS.map(s => (
              <button key={s.id} onClick={() => setService(s.id)}
                style={{
                  background: service === s.id ? s.color : 'transparent',
                  color: service === s.id ? '#fff' : 'rgba(226,232,240,.6)',
                  border: 'none', padding: '8px 16px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s',
                }}>
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>

          {viewMode === 'clusters' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'rgba(255,255,255,.04)', padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }}>
              <input type="checkbox" checked={showQoE} onChange={e => setShowQoE(e.target.checked)}
                style={{ accentColor: '#CF0A2C', cursor: 'pointer' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(226,232,240,.8)' }}>Color by QoE</span>
            </label>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(226,232,240,.35)' }}>
            {totals.citiesCount} cities · {totals.total.toLocaleString()} complaints displayed
          </div>
        </div>

        {/* ── Main grid: map + side panel ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 24 }}>
          {/* Map */}
          <div style={{ position: 'relative', height: 640, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.85)', zIndex: 1000 }}>
                <Spinner />
              </div>
            )}
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Legend overlay */}
            <div style={{ position: 'absolute', bottom: 16, left: 50, background: 'rgba(15,23,42,.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: 14, zIndex: 500 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(226,232,240,.5)', marginBottom: 10 }}>
                {viewMode === 'heatmap' ? 'Complaint Density' : (showQoE && viewMode === 'clusters') ? 'QoE Score' : 'Complaint Volume'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {viewMode === 'heatmap' ? (
                  <>
                    <div style={{ height: 8, width: 120, background: 'linear-gradient(to right, rgba(59,130,246,.6), #22C55E, #F59E0B, #EF4444, #CF0A2C)', borderRadius: 4 }} />
                    <span style={{ fontSize: 10, color: 'rgba(226,232,240,.5)', marginLeft: 8 }}>Low → High</span>
                  </>
                ) : (showQoE && viewMode === 'clusters') ? (
                  <>
                    {[['<50','#DC2626'],['50-65','#F59E0B'],['65-80','#FBBF24'],['80-90','#84CC16'],['>90','#16A34A']].map(([l,c]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
                        <span style={{ fontSize: 9, color: 'rgba(226,232,240,.6)' }}>{l}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ height: 8, width: 120, background: 'linear-gradient(to right, #3B82F6, #22C55E, #F59E0B, #EF4444, #CF0A2C)', borderRadius: 4 }} />
                    <span style={{ fontSize: 10, color: 'rgba(226,232,240,.5)', marginLeft: 8 }}>Low → High</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedCity ? (
              <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(207,10,44,.25)', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#CF0A2C', letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>SELECTED</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{selectedCity.city}</div>
                    <div style={{ fontSize: 11, color: 'rgba(226,232,240,.4)', marginTop: 2 }}>{selectedCity.region}</div>
                  </div>
                  <button onClick={() => setSelectedCity(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(226,232,240,.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
     <div style={{ background: 'rgba(207,10,44,.08)', padding: 10, borderRadius: 8 }}>
  <div style={{ fontSize: 9, color: '#FCA5A5', letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase' }}>City</div>
  <div style={{ fontSize: 22, fontWeight: 700, color: '#FF4060', marginTop: 2 }}>{selectedCity.complaints.toLocaleString()}</div>
</div>
<div style={{ background: 'rgba(245,158,11,.08)', padding: 10, borderRadius: 8 }}>
  <div style={{ fontSize: 9, color: '#FCD34D', letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase' }}>Region</div>
  <div style={{ fontSize: 22, fontWeight: 700, color: '#FBBF24', marginTop: 2 }}>
    {(() => {
      const rd = regions.find(r => r.region === selectedCity.region)
      return rd ? rd.total_complaints.toLocaleString() : '—'
    })()}
  </div>
<div style={{ background: `${QOE_COLOR(selectedCity.qoe)}15`, padding: 10, borderRadius: 8, marginTop: 8 }}>
  <div style={{ fontSize: 9, color: 'rgba(226,232,240,.5)', letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase' }}>QoE Score</div>
  <div style={{ fontSize: 22, fontWeight: 700, color: QOE_COLOR(selectedCity.qoe), marginTop: 2 }}>{selectedCity.qoe?.toFixed(1) || '—'}</div>
</div>
                  </div>
                </div>
                {selectedCity.services && (
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(226,232,240,.4)', letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>By Service</div>
                    {Object.entries(selectedCity.services).map(([k, v]) => {
                      const opt = SERVICE_OPTIONS.find(s => s.id === k)
                      const pct = (v / selectedCity.complaints * 100).toFixed(0)
                      return (
                        <div key={k} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: 'rgba(226,232,240,.7)' }}>{opt?.icon} {opt?.label}</span>
                            <span style={{ color: 'rgba(226,232,240,.5)', fontFamily: 'monospace' }}>{v.toLocaleString()} ({pct}%)</span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: opt?.color, borderRadius: 2 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.08)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'rgba(226,232,240,.35)', fontSize: 12 }}>
                💡 Click a city on the map to see detailed breakdown
              </div>
            )}

            {/* Top 10 ranking */}
            <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 18, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#CF0A2C', letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase' }}>Top 10 Cities</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 2 }}>By Complaint Volume</div>
                </div>
                <Badge variant="red">{SERVICE_OPTIONS.find(s => s.id === service)?.label}</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                {top10.map((c, i) => (
                  <div key={c.city}
                    onClick={() => {
                      setSelectedCity(c)
                      map.current?.flyTo([c.lat, c.lng], 10, { duration: 1.5 })
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selectedCity?.city === c.city ? 'rgba(207,10,44,.1)' : 'transparent', transition: 'background .2s' }}
                    onMouseOver={e => { if (selectedCity?.city !== c.city) e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}
                    onMouseOut={e => { if (selectedCity?.city !== c.city) e.currentTarget.style.background = 'transparent' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 4, background: i < 3 ? '#CF0A2C' : 'rgba(255,255,255,.06)', color: i < 3 ? '#fff' : 'rgba(226,232,240,.5)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.city}</div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,.05)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${(c.filteredComplaints / top10[0].filteredComplaints) * 100}%`, background: 'linear-gradient(to right, #CF0A2C, #F97316)', borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#FF4060', lineHeight: 1 }}>{c.filteredComplaints.toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: QOE_COLOR(c.qoe), marginTop: 2, fontFamily: 'monospace', fontWeight: 600 }}>QoE {c.qoe.toFixed(1)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom analytics ── */}
        <SectionHeader>📊 Top 10 Cities Distribution</SectionHeader>
        <Card style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}>
          <ReactApexChart options={top10Chart.options} series={top10Chart.series} type="bar" height={280} />
        </Card>
      </div>
    </div>
  )
}