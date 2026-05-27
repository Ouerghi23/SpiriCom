// src/api/client.js
// ─────────────────────────────────────────────────────────────────────
// FIX CL1: centralised request/response interceptors
// FIX CL2: timeout 30s for cold parquet loads
// FIX CL3: baseURL from VITE_API_URL env variable
// FIX CL4: JWT token attached to THIS axios instance directly —
//           useAuth.setupAxiosAuth() only patches global axios,
//           not this named instance. We read sessionStorage here.
// ─────────────────────────────────────────────────────────────────────

import axios from 'axios'

const TOKEN_KEY = 'spiricomp_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30_000,
})

// FIX CL4: attach JWT to every request on this instance
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// FIX CL1: centralised error logging
api.interceptors.response.use(
  res => res,
  err => {
    const status  = err?.response?.status
    const url     = err?.config?.url || '?'
    const message = err?.response?.data?.detail || err.message

    if (status === 401) {
      // Token expired — clear session and redirect to login
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem('spiricomp_user')
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

// ── Analytics endpoints ───────────────────────────────────────────────
export const analyticsApi = {
  overview:           ()       => api.get('/api/analytics/overview'),
  kpiTiles:           ()       => api.get('/api/analytics/kpi/tiles'),
  kpiHeatmap:         ()       => api.get('/api/analytics/kpi/heatmap'),

  complaintsTrend:    ()       => api.get('/api/analytics/complaints/trend'),
  complaintsByRegion: ()       => api.get('/api/analytics/complaints/by-region'),
  complaintsByCity:   ()       => api.get('/api/analytics/complaints/by-city'),

  anomaliesSummary:   ()       => api.get('/api/analytics/anomalies/summary'),
  anomaliesTimeline:  (region) => api.get('/api/analytics/anomalies/timeline', { params: { region } }),
  anomalyRegions:     ()       => api.get('/api/analytics/anomalies/regions'),

  forecasts:          ()       => api.get('/api/analytics/forecasts'),
  forecastScores:     ()       => api.get('/api/analytics/forecasts/scores'),
  forecastHistory:    (region) => api.get('/api/analytics/forecasts/history', { params: { region } }),

  segmentProfiles:           () => api.get('/api/analytics/segments/profiles'),
  segmentRegionDistribution: () => api.get('/api/analytics/segments/region-distribution'),

  rootCauseResults: () => api.get('/api/analytics/root-cause/results'),
  status:           () => api.get('/api/analytics/status'),
}

// ── NLP / complaint endpoints ─────────────────────────────────────────
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