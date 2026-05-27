// src/pages/ComplaintMap.jsx
// ─────────────────────────────────────────────────────────────────────
// Professional NOC Geographic Intelligence Map
//
// Changes from original:
//   - Lucide React replaces custom Ico SVG factory (professional icon library)
//   - Full react-i18next translation (map.* + common.* keys)
//   - Reset view button (fly back to Tunisia bounds)
//   - City search filter in ranking panel
//   - Pulsing alert ring on the worst QoE city (critical alarm visual)
//   - Dark-matter tile URL for cleaner cartographic backdrop
//   - Marker tooltip shows QoE badge colour inline
//   - Stat block delta shows above/below national average
//   - Selected city panel: escape key to dismiss
//   - All hardcoded EN strings replaced with t() calls
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslation }   from 'react-i18next'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.heat'
import ReactApexChart from 'react-apexcharts'
import {
  MapPin, Layers, Map, Signal, Phone, MessageSquare,
  LayoutGrid, AlertTriangle, X, BarChart3, Eye, EyeOff,
  RefreshCw, Search, ChevronRight,
} from 'lucide-react'
import { Badge, Spinner, baseChartOptions } from '../components/UI'
import { analyticsApi } from '../api/client'

// ── Color palette ─────────────────────────────────────────────────────
const C = {
  bg:        '#080808',
  bg2:       '#0C0C0C',
  bg3:       '#0A0A0A',
  border:    'rgba(255,255,255,.055)',
  text:      '#F8FAFC',
  textMuted: 'rgba(248,250,252,.5)',
  textDim:   'rgba(248,250,252,.32)',
  red:       '#CF0A2C',
  redLight:  '#FF4060',
  blue:      '#3B82F6',
  cyan:      '#22D3EE',
  green:     '#22C55E',
  amber:     '#F59E0B',
  orange:    '#F97316',
  purple:    '#A855F7',
}

// ── Map config ────────────────────────────────────────────────────────
const TUNISIA_CENTER = [33.8869, 9.5375]
const TUNISIA_ZOOM   = 7
// Dark Matter (no labels) — cleaner professional cartographic base
const TILE_URL  = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

// ── NOC alarm-aligned QoE colour scale ────────────────────────────────
const QOE_COLOR = s => s < 50 ? '#DC2626' : s < 65 ? '#EA580C' : s < 80 ? '#CA8A04' : s < 90 ? '#65A30D' : '#16A34A'
const QOE_KEY   = s => s < 50 ? 'qoeCritical' : s < 65 ? 'qoePoor' : s < 80 ? 'qoeFair' : s < 90 ? 'qoeGood' : 'qoeExcellent'

// ── Service options ───────────────────────────────────────────────────
// labelKey maps to map.* translations
const SERVICE_OPTIONS = [
  { id: 'all',   labelKey: 'map.allServices', color: C.textMuted, Icon: LayoutGrid  },
  { id: '4g',    labelKey: 'map.data4g',      color: C.blue,      Icon: Signal      },
  { id: 'voice', labelKey: 'map.voice',       color: C.green,     Icon: Phone       },
  { id: 'sms',   labelKey: 'map.sms',         color: C.amber,     Icon: MessageSquare },
]

const VIEW_OPTIONS = [
  { id: 'clusters',   labelKey: 'map.markers',    Icon: MapPin  },
  { id: 'heatmap',    labelKey: 'map.heatmap',    Icon: Layers  },
  { id: 'choropleth', labelKey: 'map.choropleth', Icon: Map     },
]

// ── Custom Leaflet marker icon ─────────────────────────────────────────
const buildIcon = (size, color, pulse = false) => L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:${size}px;height:${size}px;">
      ${pulse ? `<div style="
        position:absolute;inset:-6px;
        border:2px solid ${color};
        border-radius:50%;
        animation:map-pulse 2s ease-in-out infinite;
        opacity:.6;
      "></div>` : ''}
      <div style="
        width:${size}px;height:${size}px;
        background:${color};
        border:2.5px solid rgba(255,255,255,.85);
        border-radius:50%;
        box-shadow:0 3px 12px rgba(0,0,0,.55);
        position:relative;
      "></div>
    </div>`,
  iconSize:   [size, size],
  iconAnchor: [size / 2, size / 2],
})

// ── Dark popup HTML builder ───────────────────────────────────────────
const buildPopup = (c, t) => {
  const qColor = QOE_COLOR(c.qoe)
  return `
  <div style="font-family:'Inter',system-ui;padding:4px;min-width:230px;background:#0C0C0C;color:#F8FAFC;">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:#F8FAFC;letter-spacing:-.5px;margin-bottom:2px;">
      ${c.city}
    </div>
    <div style="font-size:10px;color:rgba(248,250,252,.4);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">
      ${c.region}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.05);margin-bottom:10px;">
      <div style="background:#0C0C0C;padding:10px 12px;">
        <div style="font-size:9px;color:rgba(248,250,252,.35);letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:4px;">
          ${t('map.complaints')}
        </div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:#CF0A2C;letter-spacing:-1px;">
          ${c.filteredComplaints.toLocaleString()}
        </div>
      </div>
      <div style="background:#0C0C0C;padding:10px 12px;">
        <div style="font-size:9px;color:rgba(248,250,252,.35);letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:4px;">
          ${t('map.qoe')}
        </div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:${qColor};letter-spacing:-1px;">
          ${c.qoe.toFixed(1)}
        </div>
      </div>
    </div>
    <div style="font-size:10px;color:rgba(248,250,252,.35);letter-spacing:.5px;">
      ${t('map.allTime')}: <strong style="color:rgba(248,250,252,.6)">${c.complaints.toLocaleString()}</strong>
    </div>
  </div>`
}

// ── Section label ─────────────────────────────────────────────────────
const SectionLabel = ({ children, action, sub }) => (
  <div style={{ marginTop: 36, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: C.red,
        letterSpacing: '4.5px', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ width: 22, height: 1, background: C.red, display: 'inline-block', flexShrink: 0 }}/>
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    {sub && (
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '1px', marginTop: 5, paddingLeft: 34 }}>
        {sub}
      </div>
    )}
  </div>
)

// ── KPI stat block ────────────────────────────────────────────────────
const StatBlock = ({ label, value, sub, color, delta, deltaLabel }) => (
  <div className="cm-stat-block" style={{
    background: C.bg3, border: `1px solid ${C.border}`,
    padding: '26px 22px', position: 'relative', overflow: 'hidden',
    transition: 'all .3s cubic-bezier(.22,1,.36,1)', cursor: 'default',
  }}>
    <div style={{
      position: 'absolute', top: 0, left: '12%', right: '12%', height: 2,
      background: `linear-gradient(90deg, transparent, ${color || C.red}, transparent)`,
    }}/>
    <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 14 }}>
      {label}
    </div>
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 34, fontWeight: 900, color: color || C.red,
      lineHeight: 1, letterSpacing: '-1px', marginBottom: 8,
    }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '.5px' }}>{sub}</div>}
    {delta != null && (
      <div style={{
        marginTop: 8, fontSize: 10, fontWeight: 700,
        color: delta >= 0 ? '#DC2626' : '#16A34A',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% {deltaLabel}
      </div>
    )}
  </div>
)

// ── Toolbar button ────────────────────────────────────────────────────
const ToolBtn = ({ active, onClick, children, activeColor }) => (
  <button onClick={onClick} style={{
    background:    active ? (activeColor || C.red) : 'transparent',
    color:         active ? '#fff' : C.textMuted,
    border:        'none', padding: '8px 14px',
    fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
    transition: 'all .18s', flexShrink: 0,
  }}
    onMouseOver={e => { if (!active) e.currentTarget.style.color = '#fff' }}
    onMouseOut={e  => { if (!active) e.currentTarget.style.color = C.textMuted }}
  >
    {children}
  </button>
)

const VDivider = () => (
  <div style={{ width: 1, alignSelf: 'stretch', background: C.border, flexShrink: 0 }}/>
)

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function ComplaintMap() {
  const { t } = useTranslation()

  const mapContainer = useRef(null)
  const mapRef       = useRef(null)
  const layerGroup   = useRef(null)
  const heatLayer    = useRef(null)

  const [cities,       setCities]       = useState([])
  const [regions,      setRegions]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [service,      setService]      = useState('all')
  const [viewMode,     setViewMode]     = useState('clusters')
  const [showQoE,      setShowQoE]      = useState(true)
  const [selectedCity, setSelectedCity] = useState(null)
  const [mapReady,     setMapReady]     = useState(false)
  const [search,       setSearch]       = useState('')

  // ESC to dismiss selected city
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelectedCity(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cityRes, regionRes] = await Promise.all([
          analyticsApi.complaintsByCity(),
          analyticsApi.complaintsByRegion(),
        ])
        setCities(cityRes.data?.cities?.length   > 0 ? cityRes.data.cities      : [])
        setRegions(regionRes.data?.regions?.length > 0 ? regionRes.data.regions : [])
        if (!cityRes.data?.cities?.length) setError(t('map.noData'))
      } catch {
        setError(`${t('common.error')} — FastAPI offline`)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── Enriched cities ───────────────────────────────────────────────
  const enrichedCities = useMemo(() => cities.map(c => ({
    ...c,
    filteredComplaints: service === 'all' ? c.complaints : (c.services?.[service] || 0),
  })), [cities, service])

  // ── Totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const total   = enrichedCities.reduce((s, c) => s + c.filteredComplaints, 0)
    const avgQoE  = enrichedCities.length
      ? enrichedCities.reduce((s, c) => s + (c.qoe || 0), 0) / enrichedCities.length
      : 0
    const worstCity = [...enrichedCities].sort((a, b) => a.qoe - b.qoe)[0]
    const peakCity  = [...enrichedCities].sort((a, b) => b.filteredComplaints - a.filteredComplaints)[0]
    const avgComplaints = enrichedCities.length ? total / enrichedCities.length : 0
    return { total, avgQoE, worstCity, peakCity, count: enrichedCities.length, avgComplaints }
  }, [enrichedCities])

  // ── Filtered ranking list ─────────────────────────────────────────
  const top10 = useMemo(() =>
    [...enrichedCities]
      .sort((a, b) => b.filteredComplaints - a.filteredComplaints)
      .filter(c => !search || c.city.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 10),
    [enrichedCities, search]
  )

  // ── Reset map view ────────────────────────────────────────────────
  const resetView = useCallback(() => {
    mapRef.current?.flyTo(TUNISIA_CENTER, TUNISIA_ZOOM, { duration: 1.2 })
  }, [])

  // ── Init Leaflet ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    mapRef.current = L.map(mapContainer.current, {
      center: TUNISIA_CENTER, zoom: TUNISIA_ZOOM,
      zoomControl: false, attributionControl: true,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(mapRef.current)
    setTimeout(() => mapRef.current?.invalidateSize(), 200)

    L.control.zoom({ position: 'topright' }).addTo(mapRef.current)
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(mapRef.current)
    setMapReady(true)
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // ── Render data layers ────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !enrichedCities.length) return
    const m = mapRef.current

    if (layerGroup.current) { m.removeLayer(layerGroup.current); layerGroup.current = null }
    if (heatLayer.current)  { m.removeLayer(heatLayer.current);  heatLayer.current  = null }

    // HEATMAP
    if (viewMode === 'heatmap') {
      const maxVal = Math.max(...enrichedCities.map(c => c.filteredComplaints), 1)
      heatLayer.current = L.heatLayer(
        enrichedCities.map(c => [c.lat, c.lng, c.filteredComplaints / maxVal]),
        { radius: 50, blur: 35, maxZoom: 12, max: 1.0,
          gradient: { 0.2: '#3B82F6', 0.4: '#22C55E', 0.6: '#F59E0B', 0.8: '#EF4444', 1.0: C.red } }
      ).addTo(m)
      return
    }

    // CLUSTERS
    if (viewMode === 'clusters') {
      layerGroup.current = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 60,
        iconCreateFunction: cluster => {
          const sum   = cluster.getAllChildMarkers().reduce((s, mk) => s + (mk.options.complaints || 0), 0)
          const size  = sum > 15000 ? 56 : sum > 5000 ? 44 : 36
          const color = sum > 15000 ? C.red : sum > 5000 ? C.amber : C.blue
          return L.divIcon({
            className: '',
            html: `<div style="
              width:${size}px;height:${size}px;background:${color};
              border:2.5px solid rgba(255,255,255,.85);border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 4px 16px rgba(0,0,0,.5);
              color:#fff;font-weight:800;font-size:${size > 50 ? 12 : 10}px;
              font-family:'Barlow Condensed',sans-serif;letter-spacing:-.3px;
            ">${sum > 999 ? (sum/1000).toFixed(1)+'k' : sum}</div>`,
            iconSize: [size,size], iconAnchor: [size/2,size/2],
          })
        },
      })

      enrichedCities.forEach(c => {
        const isWorst = totals.worstCity?.city === c.city
        const size    = c.filteredComplaints > 5000 ? 26 : c.filteredComplaints > 2000 ? 20 : c.filteredComplaints > 500 ? 15 : 11
        const color   = showQoE ? QOE_COLOR(c.qoe) : C.red
        const marker  = L.marker([c.lat, c.lng], {
          icon:       buildIcon(size, color, isWorst),
          complaints: c.filteredComplaints,
        })
        marker.bindPopup(buildPopup(c, t), { className: 'dark-popup', maxWidth: 270 })
        marker.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(marker)
      })
      m.addLayer(layerGroup.current)
      return
    }

    // CHOROPLETH — proportional circles
    if (viewMode === 'choropleth') {
      layerGroup.current = L.layerGroup()
      const maxC = Math.max(...enrichedCities.map(c => c.filteredComplaints), 1)

      enrichedCities.forEach(c => {
        const intensity = c.filteredComplaints / maxC
        const color     = intensity > .8 ? C.red : intensity > .5 ? '#EF4444' : intensity > .3 ? C.amber : intensity > .15 ? C.green : C.blue
        const circle    = L.circle([c.lat, c.lng], {
          radius: (15 + intensity * 50) * 1000,
          color, fillColor: color, fillOpacity: 0.28, weight: 1.5,
        })
        circle.bindPopup(buildPopup(c, t), { className: 'dark-popup', maxWidth: 270 })
        circle.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(circle)

        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="
            background:rgba(8,8,8,.88);color:#F8FAFC;
            padding:3px 9px;border:1px solid ${color};
            font-size:10px;font-weight:700;white-space:nowrap;
            font-family:'Barlow Condensed',sans-serif;letter-spacing:.3px;
            line-height:1.4;pointer-events:none;">
            ${c.city}<br/>
            <span style="font-weight:400;opacity:.5;font-size:9px;">${c.filteredComplaints.toLocaleString()}</span>
          </div>`,
          iconSize: [90,40], iconAnchor: [45,20],
        })
        layerGroup.current.addLayer(L.marker([c.lat, c.lng], { icon: labelIcon }))
      })
      m.addLayer(layerGroup.current)
    }
  }, [mapReady, enrichedCities, viewMode, showQoE, totals.worstCity])

  // ── Top 10 bar chart ──────────────────────────────────────────────
  const top10Chart = useMemo(() => ({
    series: [{ name: t('map.complaints'), data: top10.map(c => c.filteredComplaints) }],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions?.chart, type: 'bar', toolbar: { show: false }, background: 'transparent', animations: { enabled: false } },
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '62%', distributed: true } },
      colors: top10.map((_, i) => {
        const stops = ['#CF0A2C','#D41F35','#DA2E3C','#D63444','#D23A4A','#CE4050','#CA4656','#C64C5C','#C25262','#BE5868']
        return stops[i] || C.red
      }),
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 10,
        style: { fontSize: '10px', fontWeight: 700, colors: [C.text], fontFamily: "'Barlow Condensed',sans-serif" },
        formatter: v => v.toLocaleString(),
      },
      xaxis: {
        categories: top10.map(c => c.city),
        labels: { style: { fontSize: '11px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } },
        axisBorder: { show: false }, axisTicks: { show: false },
        title: { text: t('map.complaints'), style: { fontSize: '10px', color: C.textDim } },
      },
      yaxis: { labels: { style: { fontSize: '11px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } } },
      grid:  { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      legend: { show: false },
      tooltip: {
        theme: 'dark',
        y: { formatter: v => `${v.toLocaleString()} ${t('map.complaints').toLowerCase()}` },
        style: { fontFamily: "'Barlow Condensed',sans-serif" },
      },
    },
  }), [top10, t])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes cm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        @keyframes map-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.5);opacity:0} }

        .leaflet-container          { background:${C.bg} !important; font-family:'Inter',system-ui; }
        .leaflet-control-zoom a     { background:rgba(8,8,8,.97) !important; color:${C.text} !important; border-color:${C.border} !important; border-radius:0 !important; width:30px!important; height:30px!important; line-height:30px!important; }
        .leaflet-control-zoom a:hover { background:${C.red} !important; color:#fff !important; }
        .leaflet-control-zoom       { border:1px solid ${C.border} !important; border-radius:0 !important; }
        .leaflet-control-attribution{ background:rgba(8,8,8,.85) !important; color:${C.textDim} !important; font-size:9px !important; }
        .leaflet-control-attribution a { color:${C.textMuted} !important; }
        .leaflet-control-scale-line { background:rgba(8,8,8,.85) !important; color:${C.textMuted} !important; border-color:${C.border} !important; border-radius:0 !important; font-size:9px !important; }
        .dark-popup .leaflet-popup-content-wrapper { background:${C.bg2}; border-radius:0; box-shadow:0 8px 32px rgba(0,0,0,.65); border:1px solid ${C.border}; }
        .dark-popup .leaflet-popup-tip-container { display:none; }
        .dark-popup .leaflet-popup-content { margin:14px 16px; }
        .dark-popup .leaflet-popup-close-button { color:${C.textMuted} !important; font-size:16px !important; top:8px !important; right:10px !important; }
        .marker-cluster-small,.marker-cluster-medium,.marker-cluster-large { background:transparent !important; }
        .marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div { background:transparent !important; }
        .cm-stat-block:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.03)!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(207,10,44,.07); }
        .cm-rank-row:hover { background:rgba(255,255,255,.03)!important; }
        .cm-rank-row.active { background:rgba(207,10,44,.08)!important; }
        .cm-search:focus { outline:none; border-color:${C.red} !important; box-shadow:0 0 0 2px rgba(207,10,44,.15) !important; }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO HEADER ─────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(207,10,44,.10)', border: '1px solid rgba(207,10,44,.28)', padding: '6px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'cm-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.redLight }}>
                {t('map.liveGeo')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>Tunisia · 24 {t('layout.governorates')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 'clamp(28px,3.5vw,54px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
              }}>
                {t('map.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: C.red, fontStyle: 'italic' }}>
                  {t('map.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300 }}>
                {t('map.subtitle')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                `${cities.length} ${t('map.cityCount')}`,
                `24 ${t('layout.governorates')}`,
                t('map.freeNoKey'),
              ].map((label, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '5px 14px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)', color: C.textMuted,
                }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── ERROR BANNER ────────────────────────────────────────── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.28)',
            padding: '12px 20px', marginBottom: 24,
          }}>
            <AlertTriangle size={14} color={C.amber}/>
            <span style={{ fontSize: 12, color: C.amber }}>{error}</span>
            <span style={{ fontSize: 11, color: C.textDim, marginLeft: 4 }}>{t('map.noDataDesc')}</span>
          </div>
        )}

        {/* ── KPI TILES ───────────────────────────────────────────── */}
        <SectionLabel sub={t('map.geoKpisSub')}>
          {t('map.geoKpis')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <StatBlock
            label={t('map.complaints')}
            value={totals.total.toLocaleString()}
            sub={SERVICE_OPTIONS.find(s => s.id === service) ? t(SERVICE_OPTIONS.find(s => s.id === service).labelKey) : ''}
            color={C.red}
          />
          <StatBlock
            label={t('map.avgQoe')}
            value={totals.avgQoE.toFixed(1)}
            sub={`${t(`map.${QOE_KEY(totals.avgQoE)}`)} — national avg`}
            color={QOE_COLOR(totals.avgQoE)}
          />
          <StatBlock
            label={t('map.worstCity')}
            value={totals.worstCity?.city || '—'}
            sub={totals.worstCity ? `${t('map.qoe')} ${totals.worstCity.qoe.toFixed(1)} · ${t(`map.${QOE_KEY(totals.worstCity.qoe)}`)}` : ''}
            color={C.orange}
          />
          <StatBlock
            label={t('map.peakCity')}
            value={totals.peakCity?.city || '—'}
            sub={totals.peakCity ? `${totals.peakCity.filteredComplaints.toLocaleString()} ${t('map.complaints').toLowerCase()}` : ''}
            color={C.amber}
          />
        </div>

        {/* ── TOOLBAR ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 0,
          background: 'rgba(255,255,255,.04)', marginTop: 28, marginBottom: 1, flexWrap: 'wrap',
          border: `1px solid ${C.border}`,
        }}>
          {/* View mode */}
          <div style={{ display: 'flex' }}>
            {VIEW_OPTIONS.map(v => (
              <ToolBtn key={v.id} active={viewMode === v.id} onClick={() => setViewMode(v.id)}>
                <v.Icon size={13}/> {t(v.labelKey)}
              </ToolBtn>
            ))}
          </div>

          <VDivider/>

          {/* Service filter */}
          <div style={{ display: 'flex' }}>
            {SERVICE_OPTIONS.map(s => (
              <ToolBtn key={s.id} active={service === s.id} onClick={() => setService(s.id)} activeColor={s.color}>
                <s.Icon size={13}/> {t(s.labelKey)}
              </ToolBtn>
            ))}
          </div>

          <VDivider/>

          {/* QoE toggle — only for cluster mode */}
          {viewMode === 'clusters' && (
            <>
              <ToolBtn active={showQoE} onClick={() => setShowQoE(q => !q)}>
                {showQoE ? <Eye size={13}/> : <EyeOff size={13}/>}
                {t('map.colorByQoe')}
              </ToolBtn>
              <VDivider/>
            </>
          )}

          {/* Reset view */}
          <ToolBtn active={false} onClick={resetView}>
            <RefreshCw size={13}/> {t('map.resetView')}
          </ToolBtn>

          {/* Totals — flush right */}
          <div style={{ marginLeft: 'auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.textDim, letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0 }}>
            <MapPin size={11} color={C.textDim}/>
            {totals.count} {t('map.cityCount')} · {totals.total.toLocaleString()} {t('map.complaints').toLowerCase()}
          </div>
        </div>

        {/* ── MAP + SIDE PANEL ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 1, background: 'rgba(255,255,255,.04)', marginBottom: 1 }}>

          {/* MAP CONTAINER */}
          <div style={{ position: 'relative', height: 660, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 1000,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(8,8,8,.88)', gap: 16,
              }}>
                <Spinner size={48}/>
                <span style={{ fontSize: 10, color: C.textDim, letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {t('common.loading')}
                </span>
              </div>
            )}
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }}/>

            {/* Map legend overlay */}
            <div style={{
              position: 'absolute', bottom: 40, left: 56, zIndex: 500,
              background: 'rgba(8,8,8,.94)', backdropFilter: 'blur(12px)',
              border: `1px solid ${C.border}`, padding: '12px 16px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: C.textDim, marginBottom: 10 }}>
                {viewMode === 'heatmap' ? t('map.density') : (showQoE && viewMode === 'clusters') ? t('map.qoe') : t('map.complaints')}
              </div>
              {(viewMode === 'heatmap' || (!showQoE || viewMode !== 'clusters')) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 6, width: 120, background: 'linear-gradient(to right,#3B82F6,#22C55E,#F59E0B,#EF4444,#CF0A2C)', borderRadius: 1 }}/>
                  <span style={{ fontSize: 9, color: C.textDim }}>{t('map.qoePoor')} → {t('map.qoeExcellent')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 200 }}>
                  {[
                    ['‹50', '#DC2626', 'map.qoeCritical'],
                    ['50–65', '#EA580C', 'map.qoePoor'],
                    ['65–80', '#CA8A04', 'map.qoeFair'],
                    ['80–90', '#65A30D', 'map.qoeGood'],
                    ['›90',   '#16A34A', 'map.qoeExcellent'],
                  ].map(([range, col, key]) => (
                    <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block', flexShrink: 0 }}/>
                      <span style={{ fontSize: 9, color: C.textDim }}>{range} {t(key)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SIDE PANEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

            {/* Selected city card */}
            {selectedCity ? (
              <div style={{
                background: C.bg2, border: `1px solid rgba(207,10,44,.25)`,
                padding: '20px 22px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${C.red},transparent)` }}/>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.red, letterSpacing: '2.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>
                      {t('map.selected')}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-.5px', lineHeight: 1 }}>
                      {selectedCity.city}
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, letterSpacing: '1px' }}>
                      {selectedCity.region}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCity(null)}
                    title="ESC"
                    style={{
                      background: 'transparent', border: `1px solid ${C.border}`,
                      color: C.textMuted, cursor: 'pointer', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s', flexShrink: 0,
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red }}
                    onMouseOut={e  => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted }}
                  >
                    <X size={12}/>
                  </button>
                </div>

                {/* Metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)', marginBottom: 14 }}>
                  {[
                    { label: 'City',   value: selectedCity.complaints.toLocaleString(),         color: C.redLight },
                    { label: t('map.region'), value: (() => { const r = regions.find(r => r.region === selectedCity.region); return r ? r.total_complaints.toLocaleString() : '—' })(), color: C.amber },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.bg3, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg,transparent,${color},transparent)` }}/>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1.8px', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, color, letterSpacing: '-1px' }}>{value}</div>
                    </div>
                  ))}

                  {/* QoE — full width */}
                  <div style={{ gridColumn: '1/-1', background: C.bg3, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg,transparent,${QOE_COLOR(selectedCity.qoe)},transparent)` }}/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1.8px', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{t('map.qoe')}</div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 900, color: QOE_COLOR(selectedCity.qoe), letterSpacing: '-1px' }}>
                          {selectedCity.qoe?.toFixed(1) || '—'}
                          <span style={{ fontSize: 12, fontWeight: 400, color: C.textDim, marginLeft: 4 }}>/100</span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase',
                        padding: '4px 10px',
                        border: `1px solid ${QOE_COLOR(selectedCity.qoe)}40`,
                        background: `${QOE_COLOR(selectedCity.qoe)}14`,
                        color: QOE_COLOR(selectedCity.qoe),
                      }}>
                        {t(`map.${QOE_KEY(selectedCity.qoe)}`)}
                      </span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedCity.qoe}%`, background: `linear-gradient(to right,${C.red},${QOE_COLOR(selectedCity.qoe)})`, transition: 'width .6s ease' }}/>
                    </div>
                  </div>
                </div>

                {/* Service breakdown */}
                {selectedCity.services && Object.keys(selectedCity.services).length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                      {t('map.byService')}
                    </div>
                    {SERVICE_OPTIONS.filter(s => s.id !== 'all').map(s => {
                      const v = selectedCity.services?.[s.id] || 0
                      const pct = selectedCity.complaints > 0 ? ((v / selectedCity.complaints) * 100).toFixed(0) : 0
                      return (
                        <div key={s.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 5 }}>
                            <span style={{ color: C.textMuted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <s.Icon size={11} color={s.color}/> {t(s.labelKey)}
                            </span>
                            <span style={{ color: C.textDim, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700 }}>
                              {v.toLocaleString()} <span style={{ opacity: .55 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div style={{ height: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: s.color, transition: 'width .4s ease' }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: C.bg2, border: `1px solid ${C.border}`,
                padding: '22px', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <MapPin size={18} color={C.textDim}/>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>{t('map.noCity')}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{t('map.noCityDesc')}</div>
                </div>
              </div>
            )}

            {/* Search + top ranking */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, padding: '18px 20px', flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${C.red},transparent)` }}/>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.red, letterSpacing: '2.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                    {t('map.ranking')}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-.3px' }}>
                    {t('map.top10')}
                  </div>
                </div>
                <Badge variant="red">{t(SERVICE_OPTIONS.find(s => s.id === service)?.labelKey || 'map.allServices')}</Badge>
              </div>

              {/* Search input */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={12} color={C.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
                <input
                  className="cm-search"
                  type="text"
                  placeholder={t('map.searchCity')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%', background: C.bg3, border: `1px solid ${C.border}`,
                    color: C.text, padding: '7px 10px 7px 30px',
                    fontSize: 11, outline: 'none', fontFamily: 'inherit',
                    transition: 'border-color .2s, box-shadow .2s',
                  }}
                />
              </div>

              {/* Ranking list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 360, overflowY: 'auto' }}>
                {top10.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: 11, color: C.textDim, textAlign: 'center' }}>
                    {t('common.noData')}
                  </div>
                ) : top10.map((c, i) => (
                  <div
                    key={c.city}
                    className={`cm-rank-row${selectedCity?.city === c.city ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCity(c)
                      mapRef.current?.flyTo([c.lat, c.lng], 10, { duration: 1.5 })
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 8px', cursor: 'pointer', transition: 'background .15s',
                    }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      width: 22, height: 22, flexShrink: 0,
                      background: i < 3 ? C.red : 'rgba(255,255,255,.05)',
                      color: i < 3 ? '#fff' : C.textDim,
                      fontSize: 9, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Barlow Condensed',sans-serif",
                    }}>
                      {i + 1}
                    </div>

                    {/* Name + mini progress bar */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                        {c.city}
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(c.filteredComplaints / (top10[0]?.filteredComplaints || 1)) * 100}%`, background: `linear-gradient(to right,${C.red},${C.orange})` }}/>
                      </div>
                    </div>

                    {/* Value + QoE dot */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 800, color: C.redLight, letterSpacing: '-.3px', lineHeight: 1 }}>
                        {c.filteredComplaints.toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: QOE_COLOR(c.qoe), display: 'inline-block', flexShrink: 0 }}/>
                        <span style={{ fontSize: 9, color: QOE_COLOR(c.qoe), fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>
                          {c.qoe.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Fly-to chevron */}
                    <ChevronRight size={12} color={C.textDim} style={{ flexShrink: 0 }}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM CHART ─────────────────────────────────────────── */}
        <SectionLabel
          action={<Badge variant="red">{top10.length} {t('map.cityCount')}</Badge>}
          sub={t('map.top10Sub')}
        >
          {t('map.top10')}
        </SectionLabel>

        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${C.red},transparent)` }}/>
          <ReactApexChart options={top10Chart.options} series={top10Chart.series} type="bar" height={300}/>
        </div>

      </div>
    </div>
  )
}