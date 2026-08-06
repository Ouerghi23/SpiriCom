<div align="center">

# SpiriCom

**Service-Performance Intelligence for Real-Time Incident and Complaint Operations Management**

A data-driven NOC (Network Operations Centre) intelligence platform that connects customer complaints with network performance indicators to support proactive service monitoring for telecom operators.

Developed as a PFE (end-of-studies) project at **Huawei Technologies Tunisia**, in collaboration with **Ooredoo Tunisia**.

[![CI](https://github.com/Ouerghi23/SpiriCom/actions/workflows/ci.yml/badge.svg)](https://github.com/Ouerghi23/SpiriCom/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MLflow](https://img.shields.io/badge/MLflow-tracked-0194E2?logo=mlflow&logoColor=white)](https://mlflow.org/)

[Live demo](https://compspirit.vercel.app) · [Report an issue](https://github.com/Ouerghi23/SpiriCom/issues)

</div>

---

## Overview

Telecom operators typically analyse customer complaints and network performance data through separate processes, which limits their ability to detect service degradation early and respond proactively. SpiriCom addresses this by combining multilingual complaint analysis, predictive risk modelling, network anomaly detection, and subscriber segmentation into a single decision-support environment for NOC engineers.

The platform was built and evaluated using real operational datasets from Ooredoo Tunisia (25,727 historical complaints and 4,896 subscriber-level KPI records), following a hybrid **CRISP-DM / Scrum** methodology across three releases and fourteen sprints.

> **Data confidentiality.** The real complaint and KPI datasets used during development are excluded from this repository and from the deployed environments. Only code, configuration, and (where applicable) masked or synthetic sample data are included.

## Key Features

**Analytical modules**
- 📊 **Overview Dashboard** — consolidated complaint metrics, SLA alerts, and historical trends
- 🗺️ **Geographic Intelligence (GIS)** — marker, heatmap, and choropleth views of complaint distribution across Tunisia's governorates
- 🚨 **Anomaly Detection** — hybrid statistical (Z-score/IQR) and Isolation Forest detection with consensus-based confidence ranking
- 📉 **Disengagement Prediction** — calibrated, SHAP-explained Random Forest risk scoring, plus 5G coverage and device intelligence analysis
- 🧩 **User Segmentation** — K-Means clustering of subscriber network-experience profiles
- 🌐 **Multilingual NLP** — Arabic, French, and English complaint classification, sentiment, and urgency detection

**Operational & platform features**
- 🤖 AI NOC Assistant — conversational, context-grounded querying across all analytical modules, with pluggable LLM providers (local and cloud)
- 🔔 Field intervention dispatch via n8n/Telegram workflow automation
- 💬 Internal messaging and role-based notifications
- 🔐 JWT + RBAC authentication and administration console
- 📈 MLflow experiment tracking and GenAI observability
- ⚙️ CI/CD via GitHub Actions, containerised backend, deployed on Render (API) and Vercel (frontend)

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   React Frontend   │──▶│  FastAPI Backend   │──▶│    Data Layer      │
│ (NOC Dashboard,    │    │ (auth, complaints, │    │ SQLite (operational)│
│  Admin Console,     │◀──│  NLP, ML services,  │◀──│ Parquet (analytical) │
│  Customer Portal)   │    │  AI Assistant)      │    │                     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      External Integrations       │
                    │ LLM providers · Telegram · n8n ·  │
                    │ Gmail SMTP · GitHub Actions        │
                    └───────────────────────────────┘
```

Full analytical pipelines (data preparation → modelling → evaluation) are developed as Jupyter notebooks and served to the platform through a FastAPI ML Services layer; results are consumed by the React dashboard without recomputing analyses at request time.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Backend | Python 3.11, FastAPI, Uvicorn, Pydantic, SQLAlchemy |
| Auth | JWT (`python-jose`), `passlib[bcrypt]` |
| Data storage | SQLite (operational), Parquet (analytical) |
| Machine learning | scikit-learn, XGBoost, LightGBM, imbalanced-learn |
| Explainability | SHAP |
| Time series | Prophet, statsmodels |
| Geospatial | Leaflet.js / React-Leaflet (frontend), GeoPandas, Folium, Shapely (analysis) |
| Experiment tracking | MLflow |
| Workflow automation | n8n |
| Containerisation & CI/CD | Docker, GitHub Actions |
| Deployment | Render (backend), Vercel (frontend) |
| Testing | pytest, Vitest |

## Project Structure

```
SpiriCom/
├── 00_Data_Preprocessing.ipynb        # NB00 — cleaning, quality checks
├── 01_Complaints_Analysis.ipynb       # NB01 — complaint EDA & indicators
├── 02_KPI_Forecasting.ipynb           # NB02 — 5G traffic forecasting
├── 03_Churn_EDA.ipynb                 # NB03 — disengagement label definition
├── 03b_Churn_Label_Audit.ipynb        # NB03b — label leakage audit
├── 03c_Segmentation_D2.ipynb          # NB03c — K-Means subscriber segmentation
├── 04_Churn_Feature_Engineering.ipynb # NB04 — feature matrix preparation
├── 04b_5G_Coverage.ipynb              # NB04b — 5G adoption/coverage gap analysis
├── 05_Churn_Modeling_v2.ipynb         # NB05 — model comparison & selection
├── 06_Churn_Interpretation_v2.ipynb   # NB06 — calibration & SHAP explainability
├── 07_Anomaly_Detection.ipynb         # NB07 — statistical + Isolation Forest pipeline
├── src/                                # Backend & NLP pipeline source
├── compspirit/                         # Frontend application
├── config/                             # Configuration files
├── models/                             # Trained model artefacts
├── mlruns/                             # MLflow tracking store
├── reports/                            # Generated analytical reports
├── .github/workflows/                  # CI/CD pipeline definitions
├── Dockerfile
├── requirements.txt
└── package.json
```

## Getting Started

### Prerequisites
- Python 3.11
- Node.js (for the frontend)
- Docker (optional, for containerised deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ouerghi23/SpiriCom.git
cd SpiriCom

# Install Python dependencies
pip install -r requirements.txt --only-binary=:all:

# Install frontend dependencies (from the frontend directory)
cd compspirit
npm install
```

### Environment variables

The backend expects a `.env` file (not committed) for database, JWT, SMTP, and LLM provider credentials. See `config/` for the expected structure.

### Running locally

```bash
# Backend (from the project root)
uvicorn src.main:app --reload

# Frontend (from compspirit/)
npm run dev
```

Refer to `Dockerfile` for a containerised alternative.

## Testing

```bash
pytest --cov
```

Frontend unit tests run via Vitest from within `compspirit/`.

## Methodology

SpiriCom followed a hybrid **CRISP-DM** (for data-science activities) and **Scrum** (for software delivery) methodology across three releases:

1. **Release 1 — Foundation & Complaint Management**: authentication, Overview Dashboard, GIS Complaint Map, multilingual NLP pipeline
2. **Release 2 — AI, Machine Learning & Decision Support**: anomaly detection, disengagement prediction, user segmentation, AI Assistant
3. **Release 3 — Administration & Industrialisation**: admin console, messaging, testing/MLOps, CI/CD deployment

## Acknowledgements

Developed at **Huawei Technologies Tunisia** (Mediterranean South Service Experience Consulting and System Integration Department), in collaboration with **Ooredoo Tunisia**, as a PFE (Projet de Fin d'Études) capstone project.

## License

No license file is currently included in this repository — all rights reserved by default. Add a `LICENSE` file if you intend to make reuse terms explicit.
