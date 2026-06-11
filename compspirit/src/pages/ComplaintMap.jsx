// src/pages/ComplaintMap.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — Geographic Complaint Map (v2, UI.jsx aligned)
//
// DATA SCHEMA (unchanged from MAP-1…MAP-5):
//  province col normalized · service derived from sub_category ·
//  QoE replaced by resolution rate · GOUVERNORAT stripped
//
// MIGRATION (vs previous version):
//  CM-1  Duplicated HW / ALARM / gapColor / SectionLabel / StatBlock
//        removed — imported from components/UI. No T prop drilling.
//        Keyframes (noc-pulse/noc-spin) + hover lifts come from
//        <NocBaseStyles/> in Layout; only map-pulse stays local
//        (Leaflet divIcon HTML references it).
//  CM-2  Red discipline. This page used brand red for complaint
//        VOLUME everywhere (KPIs, top-10 ramp, rank rows, selection,
//        zoom hover, search focus, section labels). Volume is a
//        magnitude, not an alarm:
//        · analytics (top-10 bar, ranking list, KPI) → blueRamp / blue
//        · selection accents, search focus, zoom hover → HW.blue
//        · hero "LIVE GEO" pill → ALARM.normal (live = healthy)
//        Map intensity layers (heat / choropleth / clusters) keep a
//        warm high-end — high complaint density IS severity — but the
//        scale is now the token ladder:
//        HW.blue → normal → minor → major → critical.
//  CM-3  Popups, choropleth labels, and the legend were hardcoded
//        dark (#0C0E1A + white text) regardless of theme — unreadable
//        styling mismatch in light mode. All theme-aware now.
//  CM-4  Avg resolution was an unweighted city mean (a village counted
//        like Tunis). Now complaint-weighted; label says so.
//  CM-5  "Lowest Resolution" KPI accent derives from RES_COLOR of the
//        actual value (was fixed major); "Most Complaints" → minor.
//  CM-6  error / noData banners → AlertBanner. Governorate count from
//        regions.length (was hardcoded 24 twice).
//  CM-7  Hover via CSS classes (no inline onMouseOver mutation).
//        Typography floor ≥10px for data labels.
//
// FLAGGED (backend): the city field is still named `qoe` but holds
// resolution rate — rename to `resolution_rate` in the API and here
// in one coordinated change.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.heat'
import ReactApexChart from 'react-apexcharts'
import {
  MapPin, Layers, Map, Signal, Phone, Wifi,
  LayoutGrid, X, RefreshCw, Search, ChevronRight,
  CheckCircle2, ShieldAlert,
} from 'lucide-react'
import {
  HW, ALARM, FONT, gapColor, gridLine, blueRamp,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  AlertBanner, Badge, Spinner, baseChartOptions,
} from '../components/UI'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'

// ── Map config ────────────────────────────────────────────────────────
const TUNISIA_CENTER = [33.8869, 9.5375]
const TUNISIA_ZOOM   = 7
const TILE_DARK  = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
const TILE_LIGHT = 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png'
const TILE_ATTR  = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

// ── Resolution-rate severity (higher = better) ────────────────────────
const RES_COLOR = r =>
  r >= 80 ? ALARM.normal :
  r >= 60 ? ALARM.minor  :
  r >= 40 ? ALARM.major  : ALARM.critical

const RES_LABEL = r =>
  r >= 80 ? 'Good' : r >= 60 ? 'Fair' : r >= 40 ? 'Poor' : 'Critical'

// ── CM-2: volume-intensity ladder for MAP layers only ─────────────────
// (charts and lists use blueRamp — magnitude, not alarm)
const VOL_LADDER = [HW.blue, ALARM.normal, ALARM.minor, ALARM.major, ALARM.critical]
const volColor = intensity =>
  intensity > .8  ? ALARM.critical :
  intensity > .5  ? ALARM.major    :
  intensity > .3  ? ALARM.minor    :
  intensity > .15 ? ALARM.normal   : HW.blue

// ── Service options (categorical identity colors) ─────────────────────
const SERVICE_OPTIONS = [
  { id: 'all',   labelKey: 'map.allServices', color: null,         Icon: LayoutGrid },
  { id: '4g',    labelKey: 'map.data',        color: HW.blue,      Icon: Signal     },
  { id: 'voice', labelKey: 'map.voice',       color: ALARM.normal, Icon: Phone      },
  { id: '5g',    labelKey: 'map.network5g',   color: '#8B5CF6',    Icon: Wifi       },
]

const VIEW_OPTIONS = [
  { id: 'clusters',   labelKey: 'map.markers',    Icon: MapPin },
  { id: 'heatmap',    labelKey: 'map.heatmap',    Icon: Layers },
  { id: 'choropleth', labelKey: 'map.choropleth', Icon: Map    },
]

// ── Leaflet icon builder ──────────────────────────────────────────────
const buildIcon = (size, color, pulse = false) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:${size}px;height:${size}px;">
    ${pulse ? `<div style="position:absolute;inset:-6px;border:2px solid ${color};border-radius:50%;animation:map-pulse 2s ease-in-out infinite;opacity:.6;"></div>` : ''}
    <div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid rgba(255,255,255,.85);border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,.55);position:relative;"></div>
  </div>`,
  iconSize: [size, size], iconAnchor: [size / 2, size / 2],
})

// ── CM-3: theme-aware popup builder ───────────────────────────────────
const buildPopup = (c, t, T) => {
  const resColor = RES_COLOR(c.qoe)   // FLAG: qoe field = resolution rate
  const resLabel = RES_LABEL(c.qoe)
  return `
  <div style="font-family:'Barlow','Inter',system-ui;padding:4px;min-width:230px;color:${T.text};">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:${T.text};letter-spacing:-.5px;margin-bottom:2px;">${c.city}</div>
    <div style="font-size:10px;color:${T.textDim};letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${c.region || ''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:${T.border};margin-bottom:10px;">
      <div style="background:${T.bgCard};padding:10px 12px;">
        <div style="font-size:10px;color:${T.textDim};letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:4px;">${t('map.complaints')}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:${HW.blue};letter-spacing:-1px;">${c.filteredComplaints.toLocaleString()}</div>
      </div>
      <div style="background:${T.bgCard};padding:10px 12px;">
        <div style="font-size:10px;color:${T.textDim};letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:4px;">${t('map.resolved') || 'RESOLVED'}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:${resColor};letter-spacing:-1px;">${c.qoe?.toFixed(0)}%</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:6px;height:6px;border-radius:50%;background:${resColor};"></div>
      <span style="font-size:10px;color:${T.textDim};">${resLabel} resolution rate</span>
    </div>
  </div>`
}

// ── Toolbar button (page-local chrome, tokenized, CSS hover) ──────────
const ToolBtn = ({ active, onClick, children, activeColor }) => {
  const { theme: T } = useTheme()
  return (
    <button onClick={onClick} className="cm-toolbtn" style={{
      background: active ? (activeColor || HW.blue) : 'transparent',
      color:      active ? '#fff' : T.textMuted,
      border: 'none', padding: '8px 14px', fontSize: 11, fontWeight: 700,
      letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 7, transition: 'all .18s',
      flexShrink: 0, fontFamily: 'inherit',
    }}>
      {children}
    </button>
  )
}

const VDivider = () => {
  const { theme: T } = useTheme()
  return <div style={{ width: 1, alignSelf: 'stretch', background: T.border, flexShrink: 0 }}/>
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function ComplaintMap() {
  const { t }              = useTranslation()
  const { theme: T, mode } = useTheme()
  const GAP                = gapColor(T)

  const mapContainer = useRef(null)
  const mapRef       = useRef(null)
  const tileLayerRef = useRef(null)
  const layerGroup   = useRef(null)
  const heatLayer    = useRef(null)
  const prevModeRef  = useRef(null)

  const [cities,       setCities]       = useState([])
  const [regions,      setRegions]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [noData,       setNoData]       = useState(false)
  const [service,      setService]      = useState('all')
  const [viewMode,     setViewMode]     = useState('clusters')
  const [colorByRes,   setColorByRes]   = useState(true)
  const [selectedCity, setSelectedCity] = useState(null)
  const [mapReady,     setMapReady]     = useState(false)
  const [search,       setSearch]       = useState('')

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelectedCity(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setError(null); setNoData(false)
      const [cityRes, regionRes] = await Promise.all([
        analyticsApi.complaintsByCity(),
        analyticsApi.complaintsByRegion(),
      ])
      const citiesData  = cityRes.data?.cities    || []
      const regionsData = regionRes.data?.regions || []
      setCities(citiesData)
      setRegions(regionsData)
      if (!citiesData.length) setNoData(true)
    } catch {
      setError(`${t('common.error') || 'Error'} — FastAPI offline`)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived data ──────────────────────────────────────────────────
  const enrichedCities = useMemo(() => cities.map(c => ({
    ...c,
    filteredComplaints: service === 'all'
      ? c.complaints
      : (c.services?.[service] || 0),
  })), [cities, service])

  const totals = useMemo(() => {
    const total = enrichedCities.reduce((s, c) => s + c.filteredComplaints, 0)
    // CM-4: complaint-weighted resolution rate
    const wSum  = enrichedCities.reduce((s, c) => s + (c.qoe || 0) * c.complaints, 0)
    const wTot  = enrichedCities.reduce((s, c) => s + c.complaints, 0)
    const avgRes    = wTot > 0 ? wSum / wTot : 0
    const worstCity = [...enrichedCities].sort((a, b) => (a.qoe || 0) - (b.qoe || 0))[0]
    const peakCity  = [...enrichedCities]
      .sort((a, b) => b.filteredComplaints - a.filteredComplaints)[0]
    return { total, avgRes, worstCity, peakCity, count: enrichedCities.length }
  }, [enrichedCities])

  const top10 = useMemo(() =>
    [...enrichedCities]
      .sort((a, b) => b.filteredComplaints - a.filteredComplaints)
      .filter(c => !search || c.city.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 10),
    [enrichedCities, search]
  )

  const govCount = regions.length || 24   // CM-6

  const resetView = useCallback(() => {
    mapRef.current?.flyTo(TUNISIA_CENTER, TUNISIA_ZOOM, { duration: 1.2 })
  }, [])

  // ── Init Leaflet ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = L.map(mapContainer.current, {
      center: TUNISIA_CENTER, zoom: TUNISIA_ZOOM,
      zoomControl: false, attributionControl: true,
    })
    mapRef.current      = map
    prevModeRef.current = mode

    tileLayerRef.current = L.tileLayer(
      mode === 'dark' ? TILE_DARK : TILE_LIGHT,
      { attribution: TILE_ATTR, maxZoom: 19 }
    ).addTo(map)

    setTimeout(() => map.invalidateSize(), 200)
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)
    setMapReady(true)

    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, []) // eslint-disable-line

  // ── Tile swap on theme change ─────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !tileLayerRef.current) return
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    mapRef.current.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(
      mode === 'dark' ? TILE_DARK : TILE_LIGHT,
      { attribution: TILE_ATTR, maxZoom: 19 }
    ).addTo(mapRef.current)
  }, [mode, mapReady])

  // ── Map layers (CM-3: T/mode in deps so popups re-theme) ──────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !enrichedCities.length) return
    const m = mapRef.current
    if (layerGroup.current) { m.removeLayer(layerGroup.current); layerGroup.current = null }
    if (heatLayer.current)  { m.removeLayer(heatLayer.current);  heatLayer.current  = null }

    const maxVal = Math.max(...enrichedCities.map(c => c.filteredComplaints), 1)

    if (viewMode === 'heatmap') {
      // CM-2: token ladder gradient
      heatLayer.current = L.heatLayer(
        enrichedCities.map(c => [c.lat, c.lng, c.filteredComplaints / maxVal]),
        { radius: 50, blur: 35, maxZoom: 12, max: 1.0,
          gradient: { 0.2: VOL_LADDER[0], 0.4: VOL_LADDER[1], 0.6: VOL_LADDER[2],
                      0.8: VOL_LADDER[3], 1.0: VOL_LADDER[4] } }
      ).addTo(m)
      return
    }

    if (viewMode === 'clusters') {
      layerGroup.current = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 60,
        iconCreateFunction: cluster => {
          const sum   = cluster.getAllChildMarkers()
            .reduce((s, mk) => s + (mk.options.complaints || 0), 0)
          const size  = sum > 15000 ? 56 : sum > 5000 ? 44 : 36
          // CM-2: token ladder, not raw hex
          const color = sum > 15000 ? ALARM.critical : sum > 5000 ? ALARM.minor : HW.blue
          return L.divIcon({
            className: '',
            html: `<div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid rgba(255,255,255,.85);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.5);color:#fff;font-weight:800;font-size:${size > 50 ? 12 : 10}px;font-family:'Barlow Condensed',sans-serif;">${sum > 999 ? (sum / 1000).toFixed(1) + 'k' : sum}</div>`,
            iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          })
        },
      })
      enrichedCities.forEach(c => {
        const isPeak = totals.peakCity?.city === c.city
        const size   = c.filteredComplaints > 5000 ? 26
                     : c.filteredComplaints > 2000 ? 20
                     : c.filteredComplaints > 500  ? 15 : 11
        const color  = colorByRes
          ? RES_COLOR(c.qoe)
          : volColor(c.filteredComplaints / maxVal)   // CM-2: ladder, not flat red
        const marker = L.marker([c.lat, c.lng],
          { icon: buildIcon(size, color, isPeak), complaints: c.filteredComplaints })
        marker.bindPopup(buildPopup(c, t, T), { className: 'noc-popup', maxWidth: 270 })
        marker.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(marker)
      })
      m.addLayer(layerGroup.current)
      return
    }

    if (viewMode === 'choropleth') {
      layerGroup.current = L.layerGroup()
      enrichedCities.forEach(c => {
        const intensity = c.filteredComplaints / maxVal
        const color     = volColor(intensity)   // CM-2
        const circle = L.circle([c.lat, c.lng], {
          radius: (15 + intensity * 50) * 1000,
          color, fillColor: color, fillOpacity: 0.28, weight: 1.5,
        })
        circle.bindPopup(buildPopup(c, t, T), { className: 'noc-popup', maxWidth: 270 })
        circle.on('click', () => setSelectedCity(c))
        layerGroup.current.addLayer(circle)
        // CM-3: theme-aware label
        const labelBg = mode === 'dark' ? 'rgba(8,10,18,.88)' : 'rgba(245,247,252,.92)'
        const labelFg = mode === 'dark' ? '#F8FAFC' : '#0C0E1A'
        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="background:${labelBg};color:${labelFg};padding:3px 9px;border:1px solid ${color};font-size:10px;font-weight:700;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;pointer-events:none;">${c.city}<br/><span style="opacity:.55;font-size:9px;">${c.filteredComplaints.toLocaleString()}</span></div>`,
          iconSize: [90, 40], iconAnchor: [45, 20],
        })
        layerGroup.current.addLayer(L.marker([c.lat, c.lng], { icon: labelIcon }))
      })
      m.addLayer(layerGroup.current)
    }
  }, [mapReady, enrichedCities, viewMode, colorByRes, totals.peakCity?.city, t, T, mode])

  // ── Top-10 chart (CM-2: blueRamp — magnitude, not alarm) ──────────
  const top10Chart = useMemo(() => {
    const base = baseChartOptions(T)
    return {
      series: [{ name: t('map.complaints'), data: top10.map(c => c.filteredComplaints) }],
      options: {
        ...base,
        chart:  { ...base.chart, type: 'bar' },
        colors: top10.map((_, i) => blueRamp(i)),
        plotOptions: { bar: { horizontal: true, borderRadius: 0,
          barHeight: '62%', distributed: true } },
        dataLabels: { enabled: true, textAnchor: 'start', offsetX: 10,
          style: { fontSize: '10px', fontWeight: 700, colors: [T.text],
            fontFamily: FONT.display },
          formatter: v => v.toLocaleString() },
        xaxis: { categories: top10.map(c => c.city),
          labels: { style: { fontSize: '11px', colors: T.textMuted,
            fontFamily: FONT.display } },
          axisBorder: { show: false }, axisTicks: { show: false },
          title: { text: t('map.complaints'),
            style: { fontSize: '10px', color: T.textDim } } },
        yaxis: { labels: { style: { fontSize: '11px', colors: T.textMuted } } },
        legend: { show: false },
        grid: { borderColor: gridLine(T), strokeDashArray: 3,
          xaxis: { lines: { show: false } } },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v.toLocaleString()} ${t('map.complaints').toLowerCase()}` } },
      },
    }
  }, [top10, t, T])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text,
      transition: 'background .3s' }}>
      <style>{`
        /* Leaflet divIcon HTML references this — must stay global here */
        @keyframes map-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.5);opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          [style*="map-pulse"] { animation: none !important; }
        }

        .leaflet-container { background:${T.bg}!important; font-family:'Barlow','Inter',system-ui; }
        .leaflet-control-zoom a { background:${T.bgCard}!important; color:${T.text}!important; border-color:${T.border}!important; border-radius:0!important; width:30px!important; height:30px!important; line-height:30px!important; }
        .leaflet-control-zoom a:hover { background:${HW.blue}!important; color:#fff!important; }
        .leaflet-control-zoom { border:1px solid ${T.border}!important; border-radius:0!important; }
        .leaflet-control-attribution { background:${T.bgCard}!important; color:${T.textDim}!important; font-size:9px!important; }
        .leaflet-control-attribution a { color:${T.textMuted}!important; }
        .leaflet-control-scale-line { background:${T.bgCard}!important; color:${T.textMuted}!important; border-color:${T.border}!important; border-radius:0!important; font-size:9px!important; }

        /* CM-3: popup chrome follows the theme */
        .noc-popup .leaflet-popup-content-wrapper { background:${T.bgCard}; border-radius:0; box-shadow:0 8px 32px rgba(0,0,0,.45); border:1px solid ${T.border}; }
        .noc-popup .leaflet-popup-tip-container   { display:none; }
        .noc-popup .leaflet-popup-content         { margin:14px 16px; }
        .noc-popup .leaflet-popup-close-button    { color:${T.textDim}!important; font-size:16px!important; top:8px!important; right:10px!important; }

        .marker-cluster-small,.marker-cluster-medium,.marker-cluster-large { background:transparent!important; }
        .marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div { background:transparent!important; }

        .cm-toolbtn:hover { color:${T.text}; }
        .cm-rank-row:hover  { background:${T.bgCardHover}!important; }
        .cm-rank-row.active { background:${HW.blueDim}!important; }
        .cm-search:focus { outline:none; border-color:${HW.blue}!important; box-shadow:0 0 0 2px ${HW.blueDim}!important; }
        .cm-closebtn { transition: all .2s; }
        .cm-closebtn:hover { border-color:${ALARM.critical}!important; color:${ALARM.critical}!important; }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ══ HERO HEADER ════════════════════════════════════════ */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24, marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {/* CM-2: live = healthy → green */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7,
              background: `${ALARM.normal}10`, border: `1px solid ${ALARM.normal}40`,
              padding: '5px 13px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%',
                background: ALARM.normal, display: 'inline-block',
                animation: 'noc-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
                textTransform: 'uppercase', color: ALARM.normal }}>
                {t('map.liveGeo') || 'LIVE GEO'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
              Tunisia · {govCount} {t('layout.governorates') || 'Governorates'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              {/* The ONE brand-red element on this page */}
              <h1 style={{ fontFamily: FONT.display, fontSize: 'clamp(26px,3.5vw,52px)',
                fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
                color: T.text, marginBottom: 8 }}>
                {(t('map.title') || 'COMPLAINT MAP').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>
                  {(t('map.title') || 'MAP').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {t('map.subtitle') || 'Geographic complaint distribution across Tunisia'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                `${cities.length} ${t('map.cityCount') || 'Cities'}`,
                `${govCount} ${t('layout.governorates') || 'Governorates'}`,
                t('map.freeNoKey') || 'OSM · No API key',
              ].map((label, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 800,
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '5px 13px', border: `1px solid ${T.border}`,
                  background: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)',
                  color: T.textMuted }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ══ BANNERS (CM-6) ═════════════════════════════════════ */}
        {error && (
          <AlertBanner severity="major" title={t('common.error') || 'ERROR'}
            message={error} style={{ marginBottom: 20 }}/>
        )}
        {noData && !error && (
          <AlertBanner severity="minor" title={t('map.noDataTitle') || 'NO DATA'}
            message={t('map.noData') || 'No city data — check /api/analytics/complaints/by-city'}
            style={{ marginBottom: 20 }}/>
        )}

        {/* ══ KPI TILES ══════════════════════════════════════════ */}
        <SectionLabel sub={t('map.geoKpisSub') || 'Geographic complaint intelligence'}>
          {t('map.geoKpis') || 'MAP KPIs'}
        </SectionLabel>

        <GapGrid columns="repeat(4,1fr)">
          <StatBlock
            label={t('map.complaints') || 'Total Complaints'}
            value={totals.total.toLocaleString()}
            color={HW.blue}
            icon={MapPin}
            sub={t(SERVICE_OPTIONS.find(s => s.id === service)?.labelKey) || 'All'}/>
          <StatBlock
            label={t('map.avgResolution') || 'Avg Resolution Rate'}
            value={`${totals.avgRes.toFixed(1)}%`}
            color={RES_COLOR(totals.avgRes)}
            icon={CheckCircle2}
            sub={`${RES_LABEL(totals.avgRes)} — weighted national avg`}/>
          <StatBlock
            label={t('map.worstCity') || 'Lowest Resolution'}
            value={totals.worstCity?.city || '—'}
            color={totals.worstCity ? RES_COLOR(totals.worstCity.qoe) : ALARM.unknown}
            icon={ShieldAlert}
            alert={totals.worstCity ? totals.worstCity.qoe < 40 : false}
            sub={totals.worstCity ? `${totals.worstCity.qoe?.toFixed(0)}% resolved` : ''}/>
          <StatBlock
            label={t('map.peakCity') || 'Most Complaints'}
            value={totals.peakCity?.city || '—'}
            color={ALARM.minor}
            icon={Layers}
            sub={totals.peakCity
              ? `${totals.peakCity.filteredComplaints.toLocaleString()} complaints` : ''}/>
        </GapGrid>

        {/* ══ TOOLBAR ════════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0,
          background: T.mode === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
          marginTop: 24, marginBottom: 1, flexWrap: 'wrap',
          border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex' }}>
            {VIEW_OPTIONS.map(v => (
              <ToolBtn key={v.id} active={viewMode === v.id}
                onClick={() => setViewMode(v.id)}>
                <v.Icon size={13}/> {t(v.labelKey)}
              </ToolBtn>
            ))}
          </div>
          <VDivider/>
          <div style={{ display: 'flex' }}>
            {SERVICE_OPTIONS.map(s => (
              <ToolBtn key={s.id} active={service === s.id}
                onClick={() => setService(s.id)} activeColor={s.color}>
                <s.Icon size={13}/> {t(s.labelKey)}
              </ToolBtn>
            ))}
          </div>
          <VDivider/>
          {viewMode === 'clusters' && (
            <>
              <ToolBtn active={colorByRes} onClick={() => setColorByRes(q => !q)}>
                {colorByRes ? <CheckCircle2 size={13}/> : <Layers size={13}/>}
                {colorByRes
                  ? (t('map.colorByRes') || 'Color: Resolution')
                  : (t('map.colorByVol') || 'Color: Volume')}
              </ToolBtn>
              <VDivider/>
            </>
          )}
          <ToolBtn active={false} onClick={resetView}>
            <RefreshCw size={13}/> {t('map.resetView') || 'Reset'}
          </ToolBtn>
          <div style={{ marginLeft: 'auto', padding: '0 16px', display: 'flex',
            alignItems: 'center', gap: 6, fontSize: 10, color: T.textDim,
            letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0 }}>
            <MapPin size={11} color={T.textDim}/>
            {totals.count} {t('map.cityCount') || 'cities'} ·{' '}
            {totals.total.toLocaleString()} {t('map.complaints') || 'complaints'}
          </div>
        </div>

        {/* ══ MAP + SIDE PANEL ═══════════════════════════════════ */}
        <GapGrid columns="1fr 360px" style={{ marginBottom: 1 }}>

          {/* MAP */}
          <div style={{ position: 'relative', height: 660, overflow: 'hidden',
            border: `1px solid ${T.border}` }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1000,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 16,
                background: T.mode === 'dark' ? 'rgba(6,8,16,.88)' : 'rgba(240,242,248,.88)' }}>
                <Spinner size={48}/>
                <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
                  textTransform: 'uppercase' }}>
                  {t('common.loading')}
                </span>
              </div>
            )}
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }}/>

            {/* Legend — CM-3: theme-aware */}
            <div style={{ position: 'absolute', bottom: 40, left: 56, zIndex: 500,
              background: mode === 'dark' ? 'rgba(8,10,18,.94)' : 'rgba(245,247,252,.95)',
              backdropFilter: 'blur(12px)', border: `1px solid ${T.border}`,
              padding: '12px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2px',
                textTransform: 'uppercase', color: T.textDim, marginBottom: 10 }}>
                {viewMode === 'heatmap' ? 'DENSITY'
                  : colorByRes && viewMode === 'clusters' ? 'RESOLUTION RATE'
                  : 'COMPLAINT VOLUME'}
              </div>
              {viewMode === 'heatmap' || (!colorByRes || viewMode !== 'clusters') ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 6, width: 120,
                    background: `linear-gradient(to right, ${VOL_LADDER.join(', ')})`,
                    borderRadius: 1 }}/>
                  <span style={{ fontSize: 9, color: T.textDim }}>Low → High</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 200 }}>
                  {[['≥80%', ALARM.normal, 'Good'], ['60–80', ALARM.minor, 'Fair'],
                    ['40–60', ALARM.major, 'Poor'], ['<40%', ALARM.critical, 'Critical']]
                    .map(([range, col, label]) => (
                    <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%',
                        background: col, display: 'inline-block', flexShrink: 0 }}/>
                      <span style={{ fontSize: 9, color: T.textDim }}>{range} {label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SIDE PANEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Selected city — CM-2: selection is blue, not red */}
            {selectedCity ? (
              <div style={{ background: T.bgCard, border: `1px solid ${HW.blueBd}`,
                padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
                  height: 1.5,
                  background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: HW.blue, letterSpacing: '2.5px',
                      fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>
                      {t('map.selected') || 'SELECTED CITY'}
                    </div>
                    <div style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 900,
                      color: T.text, letterSpacing: '-.5px', lineHeight: 1 }}>
                      {selectedCity.city}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 3,
                      letterSpacing: '1px' }}>
                      {selectedCity.region || ''}
                    </div>
                  </div>
                  <button className="cm-closebtn" onClick={() => setSelectedCity(null)}
                    aria-label="Close city details" title="ESC"
                    style={{ background: 'transparent', border: `1px solid ${T.border}`,
                      color: T.textMuted, cursor: 'pointer', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12}/>
                  </button>
                </div>

                {/* City metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 1, background: GAP, marginBottom: 12 }}>
                  {[
                    { label: t('map.complaints') || 'City Complaints',
                      value: selectedCity.complaints.toLocaleString(), color: HW.blue },
                    { label: t('map.region') || 'Governorate',
                      value: (() => {
                        const r = regions.find(r => r.region === selectedCity.region)
                        return r ? r.total_complaints.toLocaleString() : '—'
                      })(), color: ALARM.minor },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: T.bgCardHover,
                      padding: '11px 13px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%',
                        height: 1,
                        background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}/>
                      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.8px',
                        fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>
                        {label}
                      </div>
                      <div style={{ fontFamily: FONT.display, fontSize: 22,
                        fontWeight: 900, color, letterSpacing: '-1px' }}>
                        {value}
                      </div>
                    </div>
                  ))}

                  {/* Resolution rate — full width, severity-colored */}
                  <div style={{ gridColumn: '1/-1', background: T.bgCardHover,
                    padding: '11px 13px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%',
                      height: 1,
                      background: `linear-gradient(90deg, transparent, ${RES_COLOR(selectedCity.qoe)}, transparent)` }}/>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: T.textDim,
                          letterSpacing: '1.8px', fontWeight: 700,
                          textTransform: 'uppercase', marginBottom: 5 }}>
                          {t('map.resolutionRate') || 'RESOLUTION RATE'}
                        </div>
                        <div style={{ fontFamily: FONT.display, fontSize: 26,
                          fontWeight: 900, color: RES_COLOR(selectedCity.qoe),
                          letterSpacing: '-1px' }}>
                          {selectedCity.qoe?.toFixed(1) || '—'}
                          <span style={{ fontSize: 11, fontWeight: 400,
                            color: T.textDim, marginLeft: 4 }}>%</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2px',
                        textTransform: 'uppercase', padding: '3px 10px',
                        border: `1px solid ${RES_COLOR(selectedCity.qoe)}40`,
                        background: `${RES_COLOR(selectedCity.qoe)}12`,
                        color: RES_COLOR(selectedCity.qoe) }}>
                        {RES_LABEL(selectedCity.qoe)}
                      </span>
                    </div>
                    {/* Severity-colored fill, neutral track */}
                    <div style={{ height: 3, background: T.border, overflow: 'hidden' }}>
                      <div style={{ height: '100%',
                        width: `${selectedCity.qoe || 0}%`,
                        background: RES_COLOR(selectedCity.qoe),
                        transition: 'width .6s ease' }}/>
                    </div>
                  </div>
                </div>

                {/* Service breakdown */}
                {selectedCity.services && Object.keys(selectedCity.services).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
                      fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                      {t('map.byService') || 'BY SERVICE TYPE'}
                    </div>
                    {SERVICE_OPTIONS.filter(s => s.id !== 'all').map(s => {
                      const v   = selectedCity.services?.[s.id] || 0
                      const pct = selectedCity.complaints > 0
                        ? ((v / selectedCity.complaints) * 100).toFixed(0) : 0
                      return (
                        <div key={s.id} style={{ marginBottom: 9 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: T.textMuted, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 5 }}>
                              <s.Icon size={11} color={s.color}/> {t(s.labelKey)}
                            </span>
                            <span style={{ color: T.textDim, fontFamily: FONT.display,
                              fontSize: 13, fontWeight: 700 }}>
                              {v.toLocaleString()}{' '}
                              <span style={{ opacity: .55 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div style={{ height: 2, background: T.border, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`,
                              background: s.color, transition: 'width .4s ease' }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
                padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                <MapPin size={18} color={T.textDim}/>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted,
                    marginBottom: 3 }}>
                    {t('map.noCity') || 'No city selected'}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {t('map.noCityDesc') || 'Click a marker to view details'}
                  </div>
                </div>
              </div>
            )}

            {/* Ranking panel — CM-2: magnitude in blue */}
            <ChartPanel style={{ flex: 1, padding: '16px 18px' }}
              title={t('map.top10') || 'Top 10 Cities'}
              sub={t('map.ranking') || 'Ranked by complaint volume'}
              action={<Badge variant="blue">
                {t(SERVICE_OPTIONS.find(s => s.id === service)?.labelKey || 'map.allServices')}
              </Badge>}>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={12} color={T.textDim} style={{ position: 'absolute',
                  left: 10, top: '50%', transform: 'translateY(-50%)',
                  pointerEvents: 'none' }}/>
                <input className="cm-search" type="text"
                  placeholder={t('map.searchCity') || 'Search city...'}
                  aria-label={t('map.searchCity') || 'Search city'}
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', background: T.bgCardHover,
                    border: `1px solid ${T.border}`, color: T.text,
                    padding: '7px 10px 7px 30px', fontSize: 11, outline: 'none',
                    fontFamily: 'inherit', transition: 'border-color .2s' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1,
                maxHeight: 360, overflowY: 'auto' }}>
                {top10.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 11, color: T.textDim,
                    textAlign: 'center' }}>
                    {t('common.noData') || 'No data'}
                  </div>
                ) : top10.map((c, i) => (
                  <div key={c.city}
                    className={`cm-rank-row${selectedCity?.city === c.city ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCity(c)
                      mapRef.current?.flyTo([c.lat, c.lng], 10, { duration: 1.5 })
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: 8, cursor: 'pointer', transition: 'background .15s' }}>
                    <div style={{ width: 22, height: 22, flexShrink: 0,
                      background: i < 3 ? HW.blue
                        : T.mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)',
                      color: i < 3 ? '#fff' : T.textDim, fontSize: 10, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT.display }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', marginBottom: 4 }}>
                        {c.city}
                      </div>
                      <div style={{ height: 2, background: T.border, overflow: 'hidden' }}>
                        <div style={{ height: '100%',
                          width: `${(c.filteredComplaints / (top10[0]?.filteredComplaints || 1)) * 100}%`,
                          background: `linear-gradient(to right, ${HW.blue}, ${HW.blueLight})` }}/>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT.display, fontSize: 14,
                        fontWeight: 800, color: HW.blue, letterSpacing: '-.3px',
                        lineHeight: 1 }}>
                        {c.filteredComplaints.toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                        justifyContent: 'flex-end', marginTop: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%',
                          background: RES_COLOR(c.qoe), display: 'inline-block',
                          flexShrink: 0 }}/>
                        <span style={{ fontSize: 10, color: RES_COLOR(c.qoe),
                          fontFamily: FONT.display, fontWeight: 700 }}>
                          {c.qoe?.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={12} color={T.textDim} style={{ flexShrink: 0 }}/>
                  </div>
                ))}
              </div>
            </ChartPanel>
          </div>
        </GapGrid>

        {/* ══ BOTTOM CHART ═══════════════════════════════════════ */}
        <SectionLabel
          action={<Badge variant="blue">{top10.length} {t('map.cityCount') || 'Cities'}</Badge>}
          sub={t('map.top10Sub') || 'Most complained cities — ranked by volume'}>
          {t('map.top10') || 'TOP 10 CITIES'}
        </SectionLabel>

        <ChartPanel>
          <ReactApexChart options={top10Chart.options} series={top10Chart.series}
            type="bar" height={300}/>
        </ChartPanel>

      </div>
    </div>
  )
}