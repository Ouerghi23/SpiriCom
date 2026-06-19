// ============================================================================
// FILE: src/api/client.js
// DESCRIPTION:
// Centralized Axios client configuration for the Huawei SpiriCom frontend.
// Handles:
//   - API base configuration
//   - Authentication token injection
//   - Global error handling
//   - Analytics API endpoints
//   - NLP / Complaints API endpoints
// ============================================================================

import axios from 'axios'

// ============================================================================
// Authentication Token Storage Key
// ============================================================================
const TOKEN_KEY = 'spiricomp_token'

// ============================================================================
// Axios Instance Configuration
// ============================================================================
const api = axios.create({
  // Backend API URL
  // Uses VITE_API_URL if defined, otherwise falls back to localhost
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',

  // Request timeout (30 seconds)
  timeout: 30_000,

  // Default headers
  headers: {
    'Content-Type': 'application/json',
  },
})

// ============================================================================
// Request Interceptor
// Adds JWT token automatically to every outgoing request
// ============================================================================
api.interceptors.request.use(config => {
  // Retrieve token from sessionStorage or localStorage
  const token =
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY)

  // Attach Authorization header if token exists
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// ============================================================================
// Response Interceptor
// Global API error handling
// ============================================================================
api.interceptors.response.use(
  // Successful response
  res => res,

  // Error response
  err => {
    const status = err?.response?.status
    const url = err?.config?.url || '?'
    const message = err?.response?.data?.detail || err.message

    // ------------------------------------------------------------------------
    // Unauthorized (401)
    // Clear stored authentication data and redirect to login
    // ------------------------------------------------------------------------
    if (status === 401) {
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem('spiricomp_user')

      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('spiricomp_user')

      window.location.href = '/login'
    }

    // ------------------------------------------------------------------------
    // Not Found (404)
    // ------------------------------------------------------------------------
    else if (status === 404) {
      console.warn(`[API] 404 Not Found: ${url}`)
    }

    // ------------------------------------------------------------------------
    // Server Errors (500+)
    // ------------------------------------------------------------------------
    else if (status >= 500) {
      console.error(
        `[API] Server error ${status}: ${url} — ${message}`
      )
    }

    // ------------------------------------------------------------------------
    // Network Error
    // Typically occurs when FastAPI backend is not running
    // ------------------------------------------------------------------------
    else if (!err.response) {
      console.error(
        `[API] Network error (is FastAPI running on port 8000?): ${url}`
      )
    }

    return Promise.reject(err)
  }
)

// ============================================================================
// ANALYTICS API
// ============================================================================
export const analyticsApi = {

  // ==========================================================================
  // Overview & KPI Endpoints
  // ==========================================================================
  overview: () =>
    api.get('/api/analytics/overview'),

  kpiTiles: () =>
    api.get('/api/analytics/kpi/tiles'),

  kpiHeatmap: () =>
    api.get('/api/analytics/kpi/heatmap'),

  analysisResults: () =>
    api.get('/api/analytics/analysis/results'),

  complaintsSubCategories: () =>
    api.get('/api/analytics/complaints/sub-categories'),

  complaintsTrend: () =>
    api.get('/api/analytics/complaints/trend'),

  complaintsByRegion: () =>
    api.get('/api/analytics/complaints/by-region'),

  complaintsByCity: () =>
    api.get('/api/analytics/complaints/by-city'),

  // ==========================================================================
  // Overview Enrichment Endpoints
  // Used by Overview.jsx
  // ==========================================================================
  complaintsDow: () =>
    api.get('/api/analytics/complaints/dow'),

  complaintsStatus: () =>
    api.get('/api/analytics/complaints/status'),

  forecastPreview: () =>
    api.get('/api/analytics/forecast/preview'),

  dataQuality: () =>
    api.get('/api/analytics/data/quality'),

  // ==========================================================================
  // Anomaly Detection Endpoints
  // ==========================================================================
  anomaliesSummary: () =>
    api.get('/api/analytics/anomalies/summary'),

  anomaliesTimeline: (region) =>
    api.get('/api/analytics/anomalies/timeline', {
      params: { region },
    }),

  anomalyRegions: () =>
    api.get('/api/analytics/anomalies/regions'),

  // ==========================================================================
  // Churn Prediction Endpoints (NB05)
  // ==========================================================================
  churnModelSummary: () =>
    api.get('/api/churn/model-summary'),

  churnHighRisk: (limit) =>
    api.get('/api/churn/high-risk', {
      params: { limit: limit || 500 },
    }),

  churnPredict: (msisdn) =>
    api.get(`/api/churn/predict/${msisdn}`),

  churnShap: () =>
    api.get('/api/churn/shap'),

  // ==========================================================================
  // Forecasting & Brand Analytics (NB02 Outputs)
  // ==========================================================================
  forecast5g: () =>
    api.get('/api/forecast/5g'),

  forecastBrand: () =>
    api.get('/api/forecast/brand'),

  forecastSessionFlag: () =>
    api.get('/api/forecast/session-flag'),

  brandPerformance: () =>
    api.get('/api/brand/performance'),

  // ==========================================================================
  // Segmentation & Root Cause Analysis
  // ==========================================================================
  segmentProfiles: () =>
    api.get('/api/analytics/segments/profiles'),

  segmentRegionDistribution: () =>
    api.get('/api/analytics/segments/region-distribution'),

  // Dataset 1 - Complaint Segmentation
  complaintSegmentProfiles: () =>
    api.get('/api/analytics/segments/complaints/profiles'),

  complaintSegmentRegion: () =>
    api.get('/api/analytics/segments/complaints/region-distribution'),

  // ==========================================================================
  // 5G Coverage & Adoption Analytics (NB04 Outputs)
  //
  // Endpoint:
  // GET /api/coverage/5g
  //
  // Returns:
  // {
  //   kpi,
  //   by_province,
  //   by_brand,
  //   generation_mix,
  //   performance,
  //   coverage_gaps,
  //   engaged_churners
  // }
  //
  // Used by:
  // Coverage5GSection.jsx
  // ==========================================================================
  coverage5g: () =>
    api.get('/api/coverage/5g'),

  // ==========================================================================
  // Miscellaneous Endpoints
  // ==========================================================================
  status: () =>
    api.get('/api/analytics/status'),
}

// ============================================================================
// NLP API
// Complaint Feed Management
// ============================================================================
export const nlpApi = {

  // Submit a new complaint
  submit: (data) =>
    api.post('/api/complaints/submit', data),

  // Analyze complaint using NLP
  analyze: (data) =>
    api.post('/api/complaints/analyze', data),

  // Complaint statistics
  stats: () =>
    api.get('/api/complaints/stats'),

  // Retrieve complaint list
  list: (params) =>
    api.get('/api/complaints', { params }),

  // Retrieve complaint by ID
  getById: (id) =>
    api.get(`/api/complaints/${id}`),

  // Update complaint status
  updateStatus: (id, s) =>
    api.put(`/api/complaints/${id}/status`, {
      status: s,
    }),

  // Delete complaint
  deleteComplaint: (id) =>
    api.delete(`/api/complaints/${id}`),
}

// ============================================================================
// Default Export
// ============================================================================
export default api