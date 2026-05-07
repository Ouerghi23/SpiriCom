// src/api/client.js
// Connects to FastAPI analytics endpoints which read real parquet files.
//
// FIX CL3: baseURL reads from env variable — set VITE_API_URL in .env
//          Falls back to localhost:8000 for local development.
// FIX CL1: centralised request/response interceptors for error handling.
// FIX CL2: timeout raised to 30 s to handle cold-start parquet loads.

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30_000,  // FIX CL2: 30 s — cold parquet loads can be slow
})

// ── FIX CL1: centralised response interceptor ────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error?.response?.status
    const url     = error?.config?.url || '?'
    const message = error?.response?.data?.detail || error.message

    if (status === 404) {
      console.warn(`[API] 404 Not Found: ${url}`)
    } else if (status >= 500) {
      console.error(`[API] Server error ${status}: ${url} — ${message}`)
    } else if (!error.response) {
      console.error(`[API] Network error (is FastAPI running?): ${url}`)
    }

    // Re-throw so individual pages can still catch and show their own UI
    return Promise.reject(error)
  }
)

// ── Analytics endpoints (real parquet data) ──────────────────────────────
export const analyticsApi = {
  // Overview & KPIs
  overview:           ()       => api.get('/api/analytics/overview'),
  kpiTiles:           ()       => api.get('/api/analytics/kpi/tiles'),
  kpiHeatmap:         ()       => api.get('/api/analytics/kpi/heatmap'),

  // Complaints
  complaintsTrend:    ()       => api.get('/api/analytics/complaints/trend'),
  complaintsByRegion: ()       => api.get('/api/analytics/complaints/by-region'),
  complaintsByCity:   ()       => api.get('/api/analytics/complaints/by-city'),

  // Anomaly Detection
  anomaliesSummary:   ()       => api.get('/api/analytics/anomalies/summary'),
  anomaliesTimeline:  (region) => api.get('/api/analytics/anomalies/timeline',
                                           { params: { region } }),
  anomalyRegions:     ()       => api.get('/api/analytics/anomalies/regions'),

  // Forecasting
  forecasts:          ()       => api.get('/api/analytics/forecasts'),
  forecastScores:     ()       => api.get('/api/analytics/forecasts/scores'),
  forecastHistory:    (region) => api.get('/api/analytics/forecasts/history',
                                           { params: { region } }),

  // Customer Segmentation
  segmentProfiles:            () => api.get('/api/analytics/segments/profiles'),
  segmentRegionDistribution:  () => api.get('/api/analytics/segments/region-distribution'),

  // Root Cause Analysis
  rootCauseResults:   () => api.get('/api/analytics/root-cause/results'),

  // Status
  status:             () => api.get('/api/analytics/status'),
}

// ── NLP endpoints ─────────────────────────────────────────────────────────
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