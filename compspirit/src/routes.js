// src/routes.js
// Single source of truth for all dashboard navigation links.
// Imported by Layout.jsx and LandingPage.jsx — no duplication.
//
// NOTE: Layout.jsx must import from '../routes' (this file),
//       NOT '../routes/routes' (old incorrect path).

export const NAV_LINKS = [
  { label: 'Overview',    path: '/dashboard'              },
  { label: 'Map',         path: '/dashboard/map'          },
  { label: 'Anomalies',   path: '/dashboard/anomalies'    },
  { label: 'Forecasting', path: '/dashboard/forecast'     },
  { label: 'Root Cause',  path: '/dashboard/root-cause'   },
  { label: 'Segments',    path: '/dashboard/segments'     },
  { label: 'NLP',         path: '/dashboard/nlp'          },
  { label: 'About',       path: '/dashboard/about'        },
]