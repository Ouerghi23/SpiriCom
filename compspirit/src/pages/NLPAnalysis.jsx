// src/pages/NLPAnalysis.jsx
// ─────────────────────────────────────────────────────────────────────
// NLP Customer Voice Analysis — NOC Engineer view (read + status update)
//
// FIX NLP-2: C.textSecondary → C.textMuted throughout
//            (THEME has no textSecondary key → was undefined)
// FIX NLP-3: EmptyState added to import for offline state rendering
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  PageHeader, SectionHeader, KpiCard, Card, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,   // FIX NLP-3
} from '../components/UI'
import { nlpApi } from '../api/client'

const C = THEME

const SENT_COLORS   = { critique: C.red, négatif: C.amber, neutre: C.textMuted, positif: C.green }
const LANG_COLORS   = { ar: C.red, fr: C.cyan, en: C.green }
const LANG_LABELS   = { ar: 'Arabic 🇹🇳', fr: 'French 🇫🇷', en: 'English 🇬🇧' }

const URGENCY_BADGE = {
  'très urgent': { bg: 'rgba(239,68,68,0.15)',  color: '#FCA5A5', border: 'rgba(239,68,68,0.3)'  },
  'urgent':      { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: 'rgba(245,158,11,0.3)' },
  'normal':      { bg: 'rgba(34,197,94,0.15)',  color: '#6EE7B7', border: 'rgba(34,197,94,0.3)'  },
}

const STATUS_LABEL = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu' }
const STATUS_COLOR = { open: '#EF4444', in_progress: '#F59E0B', resolved: '#22C55E' }

export default function NLPAnalysis() {
  const [stats,          setStats]          = useState(null)
  const [complaints,     setComplaints]     = useState([])
  const [loading,        setLoading]        = useState(true)
  const [apiOnline,      setApiOnline]      = useState(true)
  const [actionLoading,  setActionLoading]  = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const [filterLang,     setFilterLang]     = useState('All')
  const [filterUrgency,  setFilterUrgency]  = useState('All')
  const [filterSentiment,setFilterSentiment]= useState('All')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, complaintsRes] = await Promise.all([
        nlpApi.stats(),
        nlpApi.list({
          language:  filterLang      !== 'All' ? filterLang      : undefined,
          urgency:   filterUrgency   !== 'All' ? filterUrgency   : undefined,
          sentiment: filterSentiment !== 'All' ? filterSentiment : undefined,
          limit: 200,
        }),
      ])
      setStats(statsRes.data)
      setComplaints(complaintsRes.data?.complaints || [])
      setApiOnline(true)
    } catch {
      setApiOnline(false)
      setStats({ total: 0, by_language: {}, by_category: {}, by_sentiment: {} })
      setComplaints([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filterLang, filterUrgency, filterSentiment])

  // ── Charts ────────────────────────────────────────────────────────
  const catChart = stats?.by_category && Object.keys(stats.by_category).length > 0 ? {
    series: [{ data: Object.values(stats.by_category) }],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, distributed: true } },
      colors: [C.red, '#E5314D', '#EC5468', '#F26C7E', '#F58A99', '#F8A4B0'],
      xaxis: { categories: Object.keys(stats.by_category) },
      dataLabels: { enabled: true, style: { fontSize: '10px', colors: ['#fff'] } },
      legend: { show: false },
    },
  } : null

  const sentChart = stats?.by_sentiment && Object.keys(stats.by_sentiment).length > 0 ? {
    series: Object.values(stats.by_sentiment),
    options: {
      ...baseChartOptions,
      labels:  Object.keys(stats.by_sentiment),
      colors:  Object.keys(stats.by_sentiment).map(s => SENT_COLORS[s] || C.textMuted),
      chart:   { ...baseChartOptions.chart, type: 'donut' },
      stroke:  { width: 0 },
      plotOptions: { pie: { donut: { size: '65%' } } },
      legend:  { position: 'bottom' },
    },
  } : null

  const langChart = stats?.by_language && Object.keys(stats.by_language).length > 0 ? {
    series: Object.values(stats.by_language),
    options: {
      ...baseChartOptions,
      labels:  Object.keys(stats.by_language).map(l => LANG_LABELS[l] || l),
      colors:  Object.keys(stats.by_language).map(l => LANG_COLORS[l] || C.textMuted),
      chart:   { ...baseChartOptions.chart, type: 'donut' },
      stroke:  { width: 0 },
      legend:  { position: 'bottom' },
    },
  } : null

  // ── CRUD actions ──────────────────────────────────────────────────
  const handleStatusUpdate = async (complaintId, newStatus) => {
    setActionLoading(complaintId)
    try {
      await nlpApi.updateStatus(complaintId, newStatus)
      setComplaints(prev => prev.map(c =>
        c.complaint_id === complaintId ? { ...c, status: newStatus } : c
      ))
    } catch (err) {
      console.error('Status update error:', err)
      alert('Failed to update status — check API connection')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (complaintId) => {
    setActionLoading(complaintId)
    try {
      await nlpApi.deleteComplaint(complaintId)
      setComplaints(prev => prev.filter(c => c.complaint_id !== complaintId))
      setConfirmDelete(null)
      nlpApi.stats().then(r => setStats(r.data)).catch(() => {})
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete complaint')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading && !stats) return <div style={{ padding: 24 }}><Spinner size={48} /></div>

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 48px' }}>

        <PageHeader
          title="NLP Customer Voice Analysis"
          subtitle="Multilingual complaint monitoring — Arabic · French · English"
          badges={[`${stats?.total || 0} complaints`, apiOnline ? '🟢 API Live' : '🔴 Offline']}
        />

        {/* Offline banner */}
        {!apiOnline && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#FCD34D' }}>
            ⚠️ NLP API offline — start it with:
            <code style={{ marginLeft: 8, background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 4 }}>
              uvicorn src.nlp.analytics_api:app --reload --port 8000
            </code>
          </div>
        )}

        {/* ── KPI tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Total"        value={stats?.total || 0}                              color={C.red}   icon="📥" />
          <KpiCard label="Arabic 🇹🇳"   value={stats?.by_language?.ar  || 0}                   color={C.red}   icon="🌐" />
          <KpiCard label="French 🇫🇷"   value={stats?.by_language?.fr  || 0}                   color={C.cyan}  icon="🌐" />
          <KpiCard label="English 🇬🇧"  value={stats?.by_language?.en  || 0}                   color={C.green} icon="🌐" />
          <KpiCard label="Critiques"    value={stats?.by_sentiment?.critique || 0}              color={C.red}   icon="🔴" />
          <KpiCard label="Très urgent"  value={stats?.by_urgency_level?.['très urgent'] || 0}  color={C.red}   icon="🚨" />
        </div>

        {/* ── Charts ── */}
        {(stats?.total || 0) > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <ChartCard subtitle="Auto-detected language">
              <SectionHeader>Languages</SectionHeader>
              {langChart
                ? <ReactApexChart options={langChart.options} series={langChart.series} type="donut" height={260} />
                : <EmptyState icon="🌐" title="No language data" />
              }
            </ChartCard>
            <ChartCard subtitle="Sentiment distribution">
              <SectionHeader>Sentiment</SectionHeader>
              {sentChart
                ? <ReactApexChart options={sentChart.options} series={sentChart.series} type="donut" height={260} />
                : <EmptyState icon="😐" title="No sentiment data" />
              }
            </ChartCard>
            <ChartCard subtitle="Top complaint categories">
              <SectionHeader>Categories</SectionHeader>
              {catChart
                ? <ReactApexChart options={catChart.options} series={catChart.series} type="bar" height={260} />
                : <EmptyState icon="🗂️" title="No category data" />
              }
            </ChartCard>
          </div>
        )}

        {/* ── Filters ── */}
        <SectionHeader>📋 Recent Complaints</SectionHeader>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'Language',  value: filterLang,       set: setFilterLang,       options: ['All', 'ar', 'fr', 'en'],              labels: { ar: 'Arabic', fr: 'French', en: 'English' } },
            { label: 'Urgency',   value: filterUrgency,    set: setFilterUrgency,    options: ['All', 'très urgent', 'urgent', 'normal'] },
            { label: 'Sentiment', value: filterSentiment,  set: setFilterSentiment,  options: ['All', 'critique', 'négatif', 'neutre', 'positif'] },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{f.label}</span>
              <select value={f.value} onChange={e => f.set(e.target.value)}
                style={{ background: '#0C0C0C', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
                {f.options.map(o => <option key={o} value={o}>{f.labels?.[o] || o}</option>)}
              </select>
            </div>
          ))}
          <button onClick={fetchData}
            style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
          {/* Link to customer complaint form */}
          <a href="http://localhost:8000/form" target="_blank" rel="noreferrer"
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.05)', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: '7px 16px', fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
            📝 Open Customer Form ↗
          </a>
        </div>

        {/* ── Complaints table ── */}
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${C.border}` }}>
                {['ID', 'Text', 'Lang', 'Category', 'Sentiment', 'Urgency', 'Score', 'City', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {complaints.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>
                    {apiOnline ? 'No complaints found — submit one via the customer form.' : 'API offline.'}
                  </td>
                </tr>
              ) : (
                complaints.slice(0, 50).map(c => {
                  const urgStyle       = URGENCY_BADGE[c.nlp_urgency_level] || URGENCY_BADGE['normal']
                  const isActionLoading = actionLoading === c.complaint_id

                  return (
                    <tr key={c.complaint_id || c.id}
                      style={{ borderBottom: `1px solid ${C.border}`, opacity: isActionLoading ? 0.5 : 1 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                      <td style={{ padding: '8px 12px', color: C.red,     fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{c.complaint_id}</td>
                      {/* FIX NLP-2: C.textSecondary → C.textMuted */}
                      <td style={{ padding: '8px 12px', color: C.text,    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.text_original}>{c.text_original}</td>
                      <td style={{ padding: '8px 12px' }}><Badge variant={c.language === 'ar' ? 'red' : c.language === 'fr' ? 'cyan' : 'green'}>{c.language?.toUpperCase()}</Badge></td>
                      <td style={{ padding: '8px 12px', color: C.textMuted, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nlp_category}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <Badge variant={c.nlp_sentiment === 'critique' ? 'red' : c.nlp_sentiment === 'négatif' ? 'amber' : 'green'}>
                          {c.nlp_sentiment}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: urgStyle.bg, color: urgStyle.color, border: `1px solid ${urgStyle.border}`, padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
                          {c.nlp_urgency_level === 'très urgent' ? '🚨 ' : c.nlp_urgency_level === 'urgent' ? '⚠️ ' : ''}{c.nlp_urgency_level}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: C.textMuted, fontFamily: 'monospace', fontSize: 10 }}>{c.nlp_urgency_score?.toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', color: C.textMuted }}>{c.nlp_city || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[c.status] || '#6B7280', marginRight: 6 }} />
                        <span style={{ fontSize: 10, color: C.textMuted }}>{STATUS_LABEL[c.status] || c.status}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.status !== 'in_progress' && c.status !== 'resolved' && (
                            <button onClick={() => handleStatusUpdate(c.complaint_id, 'in_progress')}
                              disabled={isActionLoading}
                              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D', borderRadius: 6, padding: '5px 8px', fontSize: 10, fontWeight: 600, cursor: isActionLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                              ▶ En cours
                            </button>
                          )}
                          {c.status !== 'resolved' && (
                            <button onClick={() => handleStatusUpdate(c.complaint_id, 'resolved')}
                              disabled={isActionLoading}
                              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#6EE7B7', borderRadius: 6, padding: '5px 8px', fontSize: 10, fontWeight: 600, cursor: isActionLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                              ✓ Clôturer
                            </button>
                          )}
                          {confirmDelete === c.complaint_id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => handleDelete(c.complaint_id)} disabled={isActionLoading}
                                style={{ background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.5)', color: '#fff', borderRadius: 6, padding: '5px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                Confirmer
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: C.textMuted, borderRadius: 6, padding: '5px 8px', fontSize: 10, cursor: 'pointer' }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(c.complaint_id)}
                              disabled={isActionLoading}
                              style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 6, padding: '5px 8px', fontSize: 10, fontWeight: 600, cursor: isActionLoading ? 'not-allowed' : 'pointer' }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </Card>

      </div>
    </div>
  )
}