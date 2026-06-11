// src/api/client.js
import axios from 'axios'

const TOKEN_KEY = 'spiricomp_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' ,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    const status  = err?.response?.status
    const url     = err?.config?.url || '?'
    const message = err?.response?.data?.detail || err.message
    if (status === 401) {
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('spiricomp_user')
      localStorage.removeItem(TOKEN_KEY);   localStorage.removeItem('spiricomp_user')
      window.location.href = '/login'
    } else if (status === 404) {
      console.warn(`[API] 404 Not Found: ${url}`)
    } else if (status >= 500) {
      console.error(`[API] Server error ${status}: ${url} — ${message}`)
    } else if (!err.response) {
      console.error(`[API] Network error (is FastAPI running on port 8000?): ${url}`)
    }
    return Promise.reject(err)
  }
)

// ════════════════════════════════════════════════════════════════════
// analyticsApi
// ════════════════════════════════════════════════════════════════════
export const analyticsApi = {

  // ── Overview / KPI ────────────────────────────────────────────────
  overview:                 ()       => api.get('/api/analytics/overview'),
  kpiTiles:                 ()       => api.get('/api/analytics/kpi/tiles'),
  kpiHeatmap:               ()       => api.get('/api/analytics/kpi/heatmap'),
  analysisResults:          ()       => api.get('/api/analytics/analysis/results'),
  complaintsSubCategories:  ()       => api.get('/api/analytics/complaints/sub-categories'),
  complaintsTrend:          ()       => api.get('/api/analytics/complaints/trend'),
  complaintsByRegion:       ()       => api.get('/api/analytics/complaints/by-region'),
  complaintsByCity:         ()       => api.get('/api/analytics/complaints/by-city'),

  // ── Overview enrichment (added for Overview.jsx) ──────────────────
  complaintsDow:            ()       => api.get('/api/analytics/complaints/dow'),
  complaintsStatus:         ()       => api.get('/api/analytics/complaints/status'),
  forecastPreview:          ()       => api.get('/api/analytics/forecast/preview'),
  dataQuality:              ()       => api.get('/api/analytics/data/quality'),

  // ── Anomalies ─────────────────────────────────────────────────────
  anomaliesSummary:         ()       => api.get('/api/analytics/anomalies/summary'),
  anomaliesTimeline:        (region) => api.get('/api/analytics/anomalies/timeline', { params: { region } }),
  anomalyRegions:           ()       => api.get('/api/analytics/anomalies/regions'),

  // ── Churn / NB05 ─────────────────────────────────────────────────
  churnModelSummary:        ()       => api.get('/api/churn/model-summary'),
  churnHighRisk:            (limit)  => api.get('/api/churn/high-risk', { params: { limit: limit || 500 } }),
  churnPredict:             (msisdn) => api.get(`/api/churn/predict/${msisdn}`),
  churnShap:                ()       => api.get('/api/churn/shap'),

  // ── Forecasting / Brand (NB02 outputs) ───────────────────────────
  forecast5g:               ()       => api.get('/api/forecast/5g'),
  forecastBrand:            ()       => api.get('/api/forecast/brand'),
  forecastSessionFlag:      ()       => api.get('/api/forecast/session-flag'),
  brandPerformance:         ()       => api.get('/api/brand/performance'),

  // ── Segments / Root cause ─────────────────────────────────────────
  segmentProfiles:          ()       => api.get('/api/analytics/segments/profiles'),
  segmentRegionDistribution:()       => api.get('/api/analytics/segments/region-distribution'),
  // Dataset 1 — complaint segmentation
  complaintSegmentProfiles: ()       => api.get('/api/analytics/segments/complaints/profiles'),
  complaintSegmentRegion:   ()       => api.get('/api/analytics/segments/complaints/region-distribution'),
  rootCauseResults:         ()       => api.get('/api/analytics/root-cause/results'),

  // ── 5G Coverage & Adoption (NB04 outputs) ────────────────────────
  // GET /api/coverage/5g
  // Returns: { kpi, by_province, by_brand, generation_mix,
  //            performance, coverage_gaps, engaged_churners }
  // Used by: Coverage5GSection.jsx (Forecasting page)
  coverage5g:               ()       => api.get('/api/coverage/5g'),
  rootCause5g:              ()       => api.get('/api/analytics/root-cause/5g'),

  // ── Misc ──────────────────────────────────────────────────────────
  status:                   ()       => api.get('/api/analytics/status'),
}

// ════════════════════════════════════════════════════════════════════
// nlpApi — Complaint Feed
// ════════════════════════════════════════════════════════════════════
export const nlpApi = {
  submit:          (data)   => api.post('/api/complaints/submit', data),
  analyze:         (data)   => api.post('/api/complaints/analyze', data),
  stats:           ()       => api.get('/api/complaints/stats'),
  list:            (params) => api.get('/api/complaints', { params }),
  getById:         (id)     => api.get(`/api/complaints/${id}`),
  updateStatus:    (id, s)  => api.put(`/api/complaints/${id}/status`, { status: s }),
  deleteComplaint: (id)     => api.delete(`/api/complaints/${id}`),
}

export default api