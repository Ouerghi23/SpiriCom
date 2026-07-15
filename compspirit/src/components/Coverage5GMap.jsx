// src/components/Coverage5GMap.jsx
// ─────────────────────────────────────────────────────────────────────
// NOC pass (vs previous version) — same design tokens (HW/ALARM/FONT),
// same data contract (`data` prop), same Leaflet setup. Only the visual
// layer + one real bug were touched:
//
//  NOC-1  Popup "⚠️ Coverage Gap" emoji swapped for an inline SVG glyph
//         (matches the lucide alert-triangle used everywhere else —
//         emoji read as unpolished in a NOC console).
//  NOC-2  New ranked "Active Coverage Alerts" ticker under the map —
//         the console pattern every real NOC screen has: worst-first,
//         click a row to fly the map to it and pop its card.
//  NOC-3  BUG FIX: Sidi Bouzid's governorate record stored its display
//         name as the raw id 'SIDI_BOUZID'. normalize() strips
//         underscores for *matching*, so lookups worked — but the same
//         raw string was also used for the on-map label and the popup
//         title, so it rendered "SIDI_BOUZID" instead of "SIDI BOUZID"
//         like every other governorate.
//  NOC-4  Coordinate / zoom HUD readout (bottom-right) — tracks cursor
//         lat/lng and current zoom, standard ops-console chrome.
//  NOC-5  Soft ambient "halo" behind every live data point so markers
//         read as radar blips instead of flat filled dots.
//  NOC-6  Corner HUD brackets framing the viewport.
//  NOC-7  Subtle ambient scan sweep across the map — decorative only,
//         respects prefers-reduced-motion is not needed here since it's
//         ambient chrome, not content motion; kept intentionally quiet
//         (low opacity, slow, one element).
//  NOC-8  Gap markers get a pulsing ring (was a static dashed circle).
//  NOC-9  Emoji replaced with lucide icons in header/legend/buttons to
//         match the icon language used in the rest of the app.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapPin, RotateCcw, Wifi, AlertTriangle, Crosshair } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { HW, ALARM, FONT, sevDim, sevBd } from './UI'

// ── Map config ────────────────────────────────────────────────────────
const TUNISIA_CENTER = [33.8869, 9.5375]
const TUNISIA_ZOOM = 7
const TILE_DARK = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
const TILE_LIGHT = 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

// ── Color mapping ─────────────────────────────────────────────────────
const getCoverageColor = (rate) => {
  if (rate >= 20) return HW.green
  if (rate >= 15) return HW.blue
  if (rate >= 10) return HW.amber
  if (rate >= 5) return '#F97316'
  return HW.red
}

const getChurnColor = (rate) => {
  if (rate > 0.40) return ALARM.critical
  if (rate > 0.30) return ALARM.major
  if (rate > 0.20) return ALARM.minor
  return ALARM.normal
}

// ── Normalize province names for matching ─────────────────────────────
const normalize = (value) =>
  value
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase() || ''

// NOC-1: inline alert-triangle glyph — no extra dependency needed inside
// a raw popup HTML string, but visually matches the lucide icon set.
const ALERT_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`

// ── Popup builder ─────────────────────────────────────────────────────
const buildPopup = (name, data, T) => {
  const coverageColor = getCoverageColor(data.ratio_5g_pct)
  const churnColor = getChurnColor(data.churn_rate || 0)
  const isGap = data.ratio_5g_pct < 15 && (data.churn_rate || 0) > 0.33
  return `
  <div style="font-family:'Barlow','Inter',system-ui;padding:4px;min-width:210px;color:${T.text};">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;color:${T.text};letter-spacing:-.5px;">${name}</div>
      <div style="width:6px;height:6px;border-radius:50%;background:${coverageColor};"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:${T.border};margin-bottom:8px;">
      <div style="background:${T.bgCard};padding:8px 10px;">
        <div style="font-size:9px;color:${T.textDim};letter-spacing:1px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">5G Coverage</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:${coverageColor};letter-spacing:-1px;">${data.ratio_5g_pct.toFixed(1)}%</div>
      </div>
      <div style="background:${T.bgCard};padding:8px 10px;">
        <div style="font-size:9px;color:${T.textDim};letter-spacing:1px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">Disengagement</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:${churnColor};letter-spacing:-1px;">${((data.churn_rate || 0) * 100).toFixed(1)}%</div>
      </div>
    </div>
    <div style="font-size:9px;color:${T.textDim};letter-spacing:.5px;">${data.total.toLocaleString()} customers</div>
    ${isGap ? `<div style="margin-top:6px;display:flex;align-items:center;justify-content:center;gap:5px;padding:4px 8px;background:${sevDim(ALARM.critical, '15')};border:1px solid ${sevBd(ALARM.critical)};color:${ALARM.critical};font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${ALERT_SVG}<span>Coverage Gap</span></div>` : ''}
  </div>`
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT - Reçoit les données en props
// ═════════════════════════════════════════════════════════════════════
export default function Coverage5GMap({ data = [], compact = false }) {
  const { t } = useTranslation()
  const { theme: T, mode } = useTheme()

  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const tileLayerRef = useRef(null)
  const layerGroup = useRef(null)
  const markersRef = useRef({})
  const prevModeRef = useRef(null)

  const [mapReady, setMapReady] = useState(false)
  const [viewMode, setViewMode] = useState('coverage')
  const [cursor, setCursor] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(TUNISIA_ZOOM)
  // NOC-10: embedded ("compact") usage always shows coverage — the
  // churn/disengagement lens stays on the full standalone map, which
  // already has its own coverage_gaps callout section right below it.
  const effectiveViewMode = compact ? 'coverage' : viewMode

  const loading = data.length === 0

  // ── Create province lookup avec normalisation ──────────────────────
  const provinceMap = useMemo(() => {
    const map = {}
    data.forEach(p => {
      if (p?.province) {
        map[normalize(p.province)] = p
      }
    })
    return map
  }, [data])

  const getProvinceData = (name) => {
    return provinceMap[normalize(name)] || null
  }

  // ── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const valid = data.filter(p => p.total >= 10)
    const avgCoverage = valid.reduce((s, p) => s + p.ratio_5g_pct, 0) / (valid.length || 1)
    const avgChurn = valid.reduce((s, p) => s + (p.churn_rate || 0), 0) / (valid.length || 1)
    const gaps = valid.filter(p => p.ratio_5g_pct < 15 && (p.churn_rate || 0) > 0.33)
    return { avgCoverage, avgChurn, gaps: gaps.length, total: valid.length }
  }, [data])

  // NOC-2: ranked alert ticker — same threshold as the map ring / popup
  // badge, worst coverage first.
  const gapList = useMemo(() =>
    data
      .filter(p => p.total >= 10 && p.ratio_5g_pct < 15 && (p.churn_rate || 0) > 0.33)
      .sort((a, b) => a.ratio_5g_pct - b.ratio_5g_pct),
    [data])

  // ── Governorates coordinates ─────────────────────────────────────────
  const governorates = useMemo(() => [
    { id: 'TUNIS', name: 'TUNIS', lat: 36.8, lng: 10.2 },
    { id: 'ARIANA', name: 'ARIANA', lat: 36.9, lng: 10.2 },
    { id: 'BEN_AROUS', name: 'BEN AROUS', lat: 36.7, lng: 10.2 },
    { id: 'MANOUBA', name: 'MANOUBA', lat: 36.8, lng: 9.9 },
    { id: 'NABEUL', name: 'NABEUL', lat: 36.5, lng: 10.7 },
    { id: 'ZAGHOUEN', name: 'ZAGHOUEN', lat: 36.4, lng: 10.1 },
    { id: 'BIZERTE', name: 'BIZERTE', lat: 37.3, lng: 9.9 },
    { id: 'BEJA', name: 'BEJA', lat: 36.7, lng: 9.2 },
    { id: 'JENDOUBA', name: 'JENDOUBA', lat: 36.5, lng: 8.8 },
    { id: 'KEF', name: 'KEF', lat: 36.2, lng: 8.7 },
    { id: 'SILIANA', name: 'SILIANA', lat: 36.1, lng: 9.4 },
    { id: 'SOUSSE', name: 'SOUSSE', lat: 35.8, lng: 10.6 },
    { id: 'MONASTIR', name: 'MONASTIR', lat: 35.8, lng: 10.8 },
    { id: 'MAHDIA', name: 'MAHDIA', lat: 35.5, lng: 11.0 },
    { id: 'SFAX', name: 'SFAX', lat: 34.7, lng: 10.8 },
    { id: 'GAFSA', name: 'GAFSA', lat: 34.4, lng: 8.8 },
    { id: 'TOZEUR', name: 'TOZEUR', lat: 33.9, lng: 8.1 },
    { id: 'KEBILI', name: 'KEBILI', lat: 33.7, lng: 8.9 },
    { id: 'GABES', name: 'GABES', lat: 33.9, lng: 10.1 },
    { id: 'MEDENINE', name: 'MEDENINE', lat: 33.3, lng: 10.5 },
    { id: 'TATAOUINE', name: 'TATAOUINE', lat: 32.9, lng: 10.4 },
    { id: 'KAIROUAN', name: 'KAIROUAN', lat: 35.7, lng: 10.1 },
    { id: 'KASSERINE', name: 'KASSERINE', lat: 35.2, lng: 8.8 },
    // NOC-3 (bug fix): was 'SIDI_BOUZID' — the raw id leaked into the
    // display label and popup title as a literal underscore.
    { id: 'SIDI_BOUZID', name: 'SIDI BOUZID', lat: 35.0, lng: 9.5 },
  ], [])

  // ── Init Leaflet ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = L.map(mapContainer.current, {
      center: TUNISIA_CENTER,
      zoom: TUNISIA_ZOOM,
      zoomControl: false,
      attributionControl: true,
    })
    mapRef.current = map
    prevModeRef.current = mode

    tileLayerRef.current = L.tileLayer(
      mode === 'dark' ? TILE_DARK : TILE_LIGHT,
      { attribution: TILE_ATTR, maxZoom: 19 }
    ).addTo(map)

    setTimeout(() => map.invalidateSize(), 200)
    L.control.zoom({ position: 'topright' }).addTo(map)

    // NOC-4: live coordinate / zoom HUD readout
    map.on('mousemove', e => setCursor(e.latlng))
    map.on('mouseout', () => setCursor(null))
    map.on('zoomend', () => setZoomLevel(map.getZoom()))

    setMapReady(true)

    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, [])

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

  // ── Map layers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const m = mapRef.current
    if (layerGroup.current) { m.removeLayer(layerGroup.current); layerGroup.current = null }

    layerGroup.current = L.layerGroup()
    markersRef.current = {}

    governorates.forEach((gov) => {
      const provinceData = getProvinceData(gov.name)
      const hasData = provinceData && provinceData.total >= 10

      let value = 0
      if (hasData) {
        value = effectiveViewMode === 'coverage'
          ? provinceData.ratio_5g_pct
          : (provinceData.churn_rate || 0) * 100
      }

      const color = effectiveViewMode === 'coverage'
        ? getCoverageColor(value)
        : getChurnColor(value / 100)

      const radius = hasData ? Math.min(14 + value / 4, 34) : 8
      const isGap = hasData && provinceData.ratio_5g_pct < 15 && (provinceData.churn_rate || 0) > 0.33

      // NOC-5: soft ambient halo behind every live point — reads as a
      // radar blip rather than a flat filled dot.
      if (hasData) {
        layerGroup.current.addLayer(L.circleMarker([gov.lat, gov.lng], {
          radius: Math.min(radius + 10, 46),
          fillColor: color, color: 'transparent', weight: 0,
          fillOpacity: 0.12, interactive: false,
        }))
      }

      // Circle marker
      const circle = L.circleMarker([gov.lat, gov.lng], {
        radius: radius,
        fillColor: hasData ? color : T.border,
        color: hasData ? color : T.border,
        weight: 1.5,
        opacity: 0.85,
        fillOpacity: hasData ? 0.75 : 0.2,
      })

      if (hasData) {
        circle.bindPopup(buildPopup(gov.name, provinceData, T), {
          className: 'noc-popup',
          maxWidth: 250,
        })
        markersRef.current[gov.name] = circle
      }

      layerGroup.current.addLayer(circle)

      // NOC-8: pulsing gap ring (was a static dashed circle)
      if (isGap) {
        const gapRing = L.circleMarker([gov.lat, gov.lng], {
          radius: radius + 6,
          className: 'gap-pulse-ring',
          color: ALARM.critical,
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0,
          dashArray: '3,5',
          interactive: false,
        })
        layerGroup.current.addLayer(gapRing)
      }

      // Label
      const labelBg = mode === 'dark' ? 'rgba(8,10,18,.88)' : 'rgba(245,247,252,.92)'
      const labelFg = mode === 'dark' ? '#F8FAFC' : '#0C0E1A'
      const labelColor = hasData ? color : T.textDim
      const labelIcon = L.divIcon({
        className: '',
        html: `<div style="background:${labelBg};color:${labelFg};padding:2px 6px;border:1px solid ${labelColor};font-size:8px;font-weight:700;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;pointer-events:none;border-radius:2px;">${gov.name}</div>`,
        iconSize: [60, 20],
        iconAnchor: [30, -8],
      })
      layerGroup.current.addLayer(L.marker([gov.lat, gov.lng], { icon: labelIcon, interactive: false }))
    })

    m.addLayer(layerGroup.current)

    return () => {
      if (layerGroup.current) { m.removeLayer(layerGroup.current); layerGroup.current = null }
    }
  }, [mapReady, governorates, data, effectiveViewMode, mode, T])

  // ── Reset view ──────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    mapRef.current?.flyTo(TUNISIA_CENTER, TUNISIA_ZOOM, { duration: 1.2 })
  }, [])

  // NOC-2: alert ticker row → fly to that governorate and pop its card
  const focusGap = useCallback((provinceName) => {
    const gov = governorates.find(g => normalize(g.name) === normalize(provinceName))
    if (!gov || !mapRef.current) return
    mapRef.current.flyTo([gov.lat, gov.lng], 9, { duration: 1 })
    setTimeout(() => markersRef.current[gov.name]?.openPopup(), 900)
  }, [governorates])

  if (loading) {
    return (
      <div style={{
        height: 380,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            border: `3px solid ${T.border}`,
            borderTop: `3px solid ${HW.blue}`,
            borderRadius: '50%',
            animation: 'noc-spin .8s linear infinite',
          }}/>
          <span style={{ fontSize: 11, color: T.textMuted }}>Loading 5G coverage map...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={compact ? { position: 'relative' } : {
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      marginTop: 16,
    }}>
      {/* ── Styles intégrés ───────────────────────────────────────────── */}
      <style>{`
        @keyframes map-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.5);opacity:0} }
        @keyframes noc-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes noc-sweep { 0% { left: -25%; } 100% { left: 125%; } }
        @keyframes gap-ring-pulse { 0% { transform: scale(.9); opacity: .8; } 70% { transform: scale(1.55); opacity: 0; } 100% { opacity: 0; } }

        .leaflet-container { background:${T.bg}!important; font-family:'Barlow','Inter',system-ui; }
        .leaflet-control-zoom a { background:${T.bgCard}!important; color:${T.text}!important; border-color:${T.border}!important; border-radius:0!important; width:30px!important; height:30px!important; line-height:30px!important; }
        .leaflet-control-zoom a:hover { background:${HW.blue}!important; color:#fff!important; }
        .leaflet-control-zoom { border:1px solid ${T.border}!important; border-radius:0!important; }
        .leaflet-control-attribution { background:${T.bgCard}!important; color:${T.textDim}!important; font-size:9px!important; }
        .leaflet-control-attribution a { color:${T.textMuted}!important; }

        .noc-popup .leaflet-popup-content-wrapper { background:${T.bgCard}; border-radius:0; box-shadow:0 8px 32px rgba(0,0,0,.45); border:1px solid ${T.border}; }
        .noc-popup .leaflet-popup-tip-container { display:none; }
        .noc-popup .leaflet-popup-content { margin:12px 14px; }
        .noc-popup .leaflet-popup-close-button { color:${T.textDim}!important; font-size:16px!important; top:8px!important; right:10px!important; }

        /* NOC-8: pulsing ring on active coverage-gap markers */
        .gap-pulse-ring { transform-box: fill-box; transform-origin: center; animation: gap-ring-pulse 2s ease-out infinite; }
      `}</style>

      {!compact && (
        <>
          {/* ── Header ───────────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: `1px solid ${T.border}`,
            flexWrap: 'wrap',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={11} color={T.textDim}/>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.textDim,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}>
                  5G Coverage Map
                </span>
              </div>
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                padding: '2px 8px',
                background: HW.blueDim,
                color: HW.blue,
                borderRadius: 4,
              }}>
                {stats.total} governorates
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[
                { key: 'coverage', label: '5G Coverage', Icon: Wifi },
                { key: 'churn', label: 'Disengagement', Icon: AlertTriangle },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px',
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    background: viewMode === key ? HW.blueDim : 'transparent',
                    color: viewMode === key ? HW.blue : T.textDim,
                    border: `1px solid ${viewMode === key ? HW.blue : T.border}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all .15s',
                  }}>
                  <Icon size={9}/>{label}
                </button>
              ))}
              <button
                onClick={resetView}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px',
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  color: T.textDim,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all .15s',
                }}>
                <RotateCcw size={9}/>Reset
              </button>
            </div>
          </div>

          {/* ── KPI Strip ───────────────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1,
            background: T.border,
            padding: '4px 16px',
            borderBottom: `1px solid ${T.border}`,
          }}>
            {[
              { label: 'Avg Coverage', value: `${stats.avgCoverage.toFixed(1)}%`, color: HW.blue },
              { label: 'Avg Disengagement', value: `${(stats.avgChurn * 100).toFixed(1)}%`, color: ALARM.major },
              { label: 'Coverage Gaps', value: stats.gaps, color: ALARM.critical },
              { label: 'Governorates', value: stats.total, color: T.text },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: T.bgCard, padding: '3px 8px', borderTop: `2px solid ${color}` }}>
                <div style={{ fontSize: 7, color: T.textDim, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {label}
                </div>
                <div style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 800, color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div style={{ height: compact ? 300 : 340, position: 'relative' }}>
        <div
          ref={mapContainer}
          style={{
            width: '100%',
            height: '100%',
            minHeight: compact ? 300 : 340,
          }}
        />

        {/* NOC-6: corner HUD brackets — frames the viewport like an ops console */}
        {[
          { top: 8, left: 8, borderWidth: '2px 0 0 2px' },
          { top: 8, right: 8, borderWidth: '2px 2px 0 0' },
          { bottom: 8, left: 8, borderWidth: '0 0 2px 2px' },
          { bottom: 8, right: 8, borderWidth: '0 2px 2px 0' },
        ].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute', ...pos, width: 16, height: 16,
            borderStyle: 'solid', borderColor: HW.blue, opacity: 0.4,
            pointerEvents: 'none', zIndex: 500,
          }}/>
        ))}

        {/* NOC-7: ambient scan sweep — quiet, decorative, one element only */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 490 }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: '-25%', width: '22%',
            background: `linear-gradient(90deg, transparent, ${HW.blue}14, transparent)`,
            animation: 'noc-sweep 7s linear infinite',
          }}/>
        </div>

        {/* ── Legend ────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: '6px 10px',
          opacity: 0.92,
          zIndex: 1000,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            {viewMode === 'coverage'
              ? <Wifi size={9} color={T.textDim}/>
              : <AlertTriangle size={9} color={T.textDim}/>}
            <span style={{
              fontSize: 7,
              fontWeight: 700,
              color: T.textDim,
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}>
              {viewMode === 'coverage' ? '5G Coverage' : 'Disengagement'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(viewMode === 'coverage'
              ? [
                { label: '≥20%', color: HW.green },
                { label: '15-20%', color: HW.blue },
                { label: '10-15%', color: HW.amber },
                { label: '5-10%', color: '#F97316' },
                { label: '<5%', color: HW.red },
              ]
              : [
                { label: '>40%', color: ALARM.critical },
                { label: '30-40%', color: ALARM.major },
                { label: '20-30%', color: ALARM.minor },
                { label: '<20%', color: ALARM.normal },
              ]
            ).map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 3, background: item.color, borderRadius: 1.5 }} />
                <span style={{ fontSize: 7, color: T.textMuted }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* NOC-4: coordinate / zoom HUD readout */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: '5px 10px',
          opacity: 0.92,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Crosshair size={10} color={T.textDim}/>
          <span style={{ fontFamily: FONT.display, fontSize: 9, color: T.textMuted, letterSpacing: '.5px' }}>
            {cursor ? `${cursor.lat.toFixed(2)}° ${cursor.lng.toFixed(2)}°` : '—.—— ° —.—— °'}
          </span>
          <span style={{ width: 1, height: 10, background: T.border }}/>
          <span style={{ fontFamily: FONT.display, fontSize: 9, color: T.textDim }}>Z{zoomLevel}</span>
        </div>

        {/* ── Gap alert ──────────────────────────────────────────────── */}
        {stats.gaps > 0 && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            background: sevDim(ALARM.critical, '15'),
            border: `1px solid ${sevBd(ALARM.critical)}`,
            borderRadius: 4,
            zIndex: 1000,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: ALARM.critical,
              display: 'inline-block',
              animation: 'map-pulse 1.5s infinite',
            }} />
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: ALARM.critical,
              letterSpacing: '0.5px',
            }}>
              {stats.gaps} Coverage {stats.gaps === 1 ? 'Gap' : 'Gaps'}
            </span>
          </div>
        )}
      </div>

      {/* ── NOC-2: ranked active-alert ticker ────────────────────────── */}
      {gapList.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          <div style={{
            padding: '8px 16px 4px',
            fontSize: 8, fontWeight: 800, color: T.textDim,
            letterSpacing: '1.5px', textTransform: 'uppercase',
          }}>
            Active Coverage Alerts · {gapList.length}
          </div>
          <div style={{ maxHeight: 132, overflowY: 'auto' }}>
            {gapList.map((g, i) => {
              const sev = g.ratio_5g_pct < 5 ? ALARM.critical : ALARM.major
              return (
                <button key={g.province} onClick={() => focusGap(g.province)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '7px 16px',
                    background: i % 2
                      ? 'transparent'
                      : (mode === 'dark' ? 'rgba(255,255,255,.015)' : 'rgba(0,0,0,.015)'),
                    border: 'none', borderLeft: `3px solid ${sev}`,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sev, flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: T.text }}>
                    {g.province}
                  </span>
                  <span style={{ fontSize: 9, color: T.textDim }}>
                    {g.ratio_5g_pct.toFixed(1)}% coverage
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: sev, minWidth: 44, textAlign: 'right' }}>
                    {((g.churn_rate || 0) * 100).toFixed(1)}%
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}