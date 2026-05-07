"""
Huawei CompSpirit
==================
Telecom Complaint Analysis and Network Intelligence Platform
Huawei Technologies × Ooredoo Tunisia

Run:
    streamlit run src/dashboard/app.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from src.dashboard.data_loader import (
    load_all, KPI_META, qoe_color, delta_arrow,
    QOE_GREEN, QOE_YELLOW, REGIONS
)

st.set_page_config(
    page_title="Huawei CompSpirit",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
.stApp {
    background-color: #F4F6F9;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}
[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #0D0D1A 0%, #1C0A0A 60%, #2D0A0A 100%);
    border-right: 3px solid #CF0A2C;
}
[data-testid="stSidebar"] * { color: #ECECEC !important; }
[data-testid="stSidebar"] .stMetric label { color: #AAAAAA !important; }
[data-testid="stSidebar"] .stMetric [data-testid="metric-container"] {
    background: rgba(255,255,255,0.07);
    border-radius: 8px; padding: 8px 12px;
    border: 1px solid rgba(207,10,44,0.25);
}
.brand-header {
    background: linear-gradient(135deg, #CF0A2C 0%, #8B0000 45%, #1C1C2E 100%);
    padding: 22px 28px; border-radius: 14px; margin-bottom: 26px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 6px 20px rgba(207,10,44,0.20);
}
.brand-title {
    color: white; font-size: 24px; font-weight: 700;
    letter-spacing: 0.5px; margin: 0;
}
.brand-subtitle { color: rgba(255,255,255,0.70); font-size: 13px; margin: 4px 0 0 0; }
.brand-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.brand-badge {
    background: rgba(255,255,255,0.14); color: white;
    border: 1px solid rgba(255,255,255,0.28); padding: 4px 12px;
    border-radius: 20px; font-size: 11px; font-weight: 600;
}
.section-header {
    color: #1C1C2E; font-size: 14px; font-weight: 700;
    border-left: 4px solid #CF0A2C; padding-left: 12px;
    margin: 22px 0 14px 0; letter-spacing: 0.3px;
}
.kpi-card {
    background: white; border: 1px solid #E3E6EA; border-radius: 12px;
    padding: 18px 16px; text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    border-top: 3px solid #CF0A2C; margin-bottom: 4px;
}
.kpi-label {
    color: #6B7280; font-size: 11px; font-weight: 600;
    letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;
}
.kpi-value { color: #111827; font-size: 26px; font-weight: 700; margin: 4px 0; }
.kpi-unit  { color: #9CA3AF; font-size: 12px; }
.kpi-delta { font-size: 12px; margin-top: 4px; }
.badge-high   { background:#FEE2E2; color:#991B1B; padding:3px 10px;
                border-radius:12px; font-size:11px; font-weight:700; }
.badge-medium { background:#FEF3C7; color:#92400E; padding:3px 10px;
                border-radius:12px; font-size:11px; font-weight:700; }
.badge-low    { background:#D1FAE5; color:#065F46; padding:3px 10px;
                border-radius:12px; font-size:11px; font-weight:700; }
h1, h2, h3 { color: #111827 !important; }
[data-testid="stDataFrame"] {
    border: 1px solid #E3E6EA; border-radius: 8px; overflow: hidden;
}
#MainMenu { visibility: hidden; }
footer    { visibility: hidden; }
[data-testid="stDecoration"] { display: none; }
</style>
""", unsafe_allow_html=True)

# ── Constants ──────────────────────────────────────────────────────────────────
QOE_COL   = "qoe_score_mean"
DATA_QOE  = "data_qoe_score_mean"
CAT_DATA  = "complaints_data"
CAT_VOICE = "complaints_voice"
CAT_OTHER = "cat_other"

C = {
    "red":     "#CF0A2C",
    "blue":    "#1A73E8",
    "green":   "#0F9D58",
    "amber":   "#F59E0B",
    "purple":  "#7C3AED",
    "teal":    "#0D9488",
    "gray":    "#6B7280",
    "ooredoo": "#E30613",
}

PL = dict(
    template="plotly_white",
    paper_bgcolor="white",
    plot_bgcolor="#FAFAFA",
    font=dict(family="Segoe UI, Arial, sans-serif", color="#111827", size=12),
    margin=dict(l=0, r=0, t=32, b=0),
)

# ── Load data ──────────────────────────────────────────────────────────────────
@st.cache_data(show_spinner="Loading CompSpirit data...")
def get_data():
    return load_all()

data             = get_data()
complaint_agg    = data["complaint_agg"]
kpi_agg          = data["kpi_agg"]
complaints_clean = data["complaints_clean"]
anomaly_results  = data["anomaly_results"]
forecasts        = data["forecasts"]
kmeans_users     = data["kmeans_users"]
cluster_profiles = data["cluster_profiles"]
pred_scores      = data["prediction_scores"]


# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("""
    <div style="text-align:center;padding:24px 0 18px">
        <div style="background:linear-gradient(135deg,#CF0A2C,#8B0000);
                    width:60px;height:60px;border-radius:16px;
                    display:inline-flex;align-items:center;
                    justify-content:center;font-size:30px;margin-bottom:12px">
            📡
        </div>
        <div style="color:white;font-size:18px;font-weight:700;
                    letter-spacing:0.5px">CompSpirit</div>
        <div style="color:rgba(255,255,255,0.45);font-size:11px;margin-top:4px">
            Huawei × Ooredoo Tunisia
        </div>
    </div>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.10);margin:0 0 16px">
    """, unsafe_allow_html=True)

    page = st.radio("nav", [
        "🏠  Overview",
        "🗺️  Complaint Map",
        "🚨  Anomaly Feed",
        "📈  Forecasting",
        "👥  User Segments",
        "🔤  NLP Analysis",
    ], label_visibility="collapsed")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.10);margin:16px 0">',
                unsafe_allow_html=True)
    st.markdown('<div style="color:rgba(255,255,255,0.40);font-size:10px;'
                'font-weight:600;letter-spacing:1.2px;margin-bottom:10px">'
                'FILTERS</div>', unsafe_allow_html=True)

    all_regions = sorted(complaint_agg["region"].unique().tolist()) \
                  if not complaint_agg.empty else REGIONS
    selected_regions = st.multiselect("Regions", all_regions, default=all_regions)

    if not complaint_agg.empty:
        date_min   = complaint_agg["date"].min().date()
        date_max   = complaint_agg["date"].max().date()
        date_range = st.date_input("Date Range",
                                   value=(date_min, date_max),
                                   min_value=date_min, max_value=date_max)
    else:
        date_range = (None, None)

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.10);margin:16px 0">',
                unsafe_allow_html=True)
    if not complaint_agg.empty:
        total_c = int(complaint_agg["total_complaints"].sum())
        total_a = int(anomaly_results["anomaly_flag"].sum()) \
                  if not anomaly_results.empty else 0
        st.metric("Total Complaints",   f"{total_c:,}")
        st.metric("Anomalies Detected", f"{total_a:,}")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.10);margin:16px 0">',
                unsafe_allow_html=True)
    st.markdown(
        '<div style="color:rgba(255,255,255,0.28);font-size:10px;'
        'text-align:center;line-height:1.8">'
        'Huawei CompSpirit v1.0<br>PFE Master Engineering<br>'
        'Huawei Technologies × Ooredoo</div>',
        unsafe_allow_html=True
    )


# ── Filters ────────────────────────────────────────────────────────────────────
def apply_filters(df, date_col="date"):
    if df.empty:
        return df
    if selected_regions:
        df = df[df["region"].isin(selected_regions)]
    if date_range and len(date_range) == 2 and date_range[0] and date_range[1]:
        df = df[(df[date_col] >= pd.Timestamp(date_range[0])) &
                (df[date_col] <= pd.Timestamp(date_range[1]))]
    return df

ca_f = apply_filters(complaint_agg)
ka_f = apply_filters(kpi_agg)
an_f = apply_filters(anomaly_results)


def brand_header(title, subtitle="", badges=None):
    b = ""
    if badges:
        b = '<div class="brand-badges">' + "".join(
            f'<span class="brand-badge">{x}</span>' for x in badges
        ) + "</div>"
    st.markdown(f"""
    <div class="brand-header">
        <div>
            <p class="brand-title">📡 {title}</p>
            <p class="brand-subtitle">{subtitle}</p>
        </div>{b}
    </div>""", unsafe_allow_html=True)


def sec(title):
    st.markdown(f'<div class="section-header">{title}</div>',
                unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 1 — OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════════
if page == "🏠  Overview":
    brand_header(
        "Huawei CompSpirit",
        "Telecom Complaint Analysis & Network Intelligence Platform — Ooredoo Tunisia",
        badges=["NOC Dashboard", "Live Data", f"{len(ca_f):,} records"]
    )

    if ca_f.empty or ka_f.empty:
        st.warning("No data for selected filters.")
        st.stop()

    # KPI tiles
    sec("📊 Network KPIs — Last 7 Days")
    ka_s  = ka_f.sort_values("date")
    nr    = max(len(selected_regions), 1)
    last7 = ka_s.tail(7 * nr)
    prev7 = ka_s.iloc[-(14 * nr):-(7 * nr)]
    keys  = [k for k in list(KPI_META.keys())[:8] if k in ka_f.columns]
    cols  = st.columns(4)

    for i, k in enumerate(keys):
        m    = KPI_META[k]
        cur  = last7[k].mean() if not last7.empty else 0
        prev = prev7[k].mean() if not prev7.empty else 0
        d    = delta_arrow(cur, prev, m["good"])
        dc   = "#0F9D58" if "▲" in d else "#CF0A2C" if "▼" in d else "#6B7280"
        if m["good"] == "low":
            dc = "#0F9D58" if "▼" in d else "#CF0A2C" if "▲" in d else "#6B7280"
        vc = ("#0F9D58" if cur>=80 else "#F59E0B" if cur>=60 else "#CF0A2C") \
             if "qoe" in k else C["blue"]
        with cols[i % 4]:
            st.markdown(f"""
            <div class="kpi-card">
                <div class="kpi-label">{m['label']}</div>
                <div class="kpi-value" style="color:{vc}">
                    {cur:{m['fmt']}}<span class="kpi-unit"> {m['unit']}</span>
                </div>
                <div class="kpi-delta" style="color:{dc}">{d}</div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Trend
    sec("📉 Daily Complaint Volume")
    daily = ca_f.groupby("date")["total_complaints"].sum().reset_index()
    daily["roll7"] = daily["total_complaints"].rolling(7, min_periods=1).mean()
    spikes = daily[daily["total_complaints"] >
                   daily["total_complaints"].mean() +
                   2 * daily["total_complaints"].std()]

    fig_t = go.Figure()
    fig_t.add_trace(go.Scatter(
        x=daily["date"], y=daily["total_complaints"],
        mode="lines", name="Daily",
        line=dict(color=C["red"], width=2),
        fill="tozeroy", fillcolor="rgba(207,10,44,0.06)"
    ))
    fig_t.add_trace(go.Scatter(
        x=spikes["date"], y=spikes["total_complaints"],
        mode="markers", name="Spike",
        marker=dict(color=C["red"], size=9, symbol="diamond",
                    line=dict(color="white", width=1.5))
    ))
    fig_t.add_trace(go.Scatter(
        x=daily["date"], y=daily["roll7"],
        mode="lines", name="7d avg",
        line=dict(color=C["blue"], width=1.8, dash="dot")
    ))
    fig_t.update_layout(**PL, height=270,
        legend=dict(orientation="h", yanchor="bottom", y=1.02,
                    bgcolor="rgba(0,0,0,0)"))
    st.plotly_chart(fig_t, use_container_width=True)

    # QoE + Pie
    cl, cr = st.columns([3, 2])
    with cl:
        sec("🌡️ QoE Score — Region × Month")
        hc = QOE_COL if QOE_COL in ka_f.columns else DATA_QOE
        if hc in ka_f.columns:
            kh = ka_f.copy()
            kh["month"] = kh["date"].dt.strftime("%b %Y")
            pv = kh.groupby(["region","month"])[hc].mean().unstack(fill_value=np.nan)
            fig_h = px.imshow(pv, color_continuous_scale="RdYlGn",
                              zmin=40, zmax=100,
                              labels=dict(color="QoE"), aspect="auto")
            fig_h.update_layout(**PL, height=300,
                coloraxis_colorbar=dict(thickness=10))
            st.plotly_chart(fig_h, use_container_width=True)

    with cr:
        sec("🗂️ Service Type")
        sv = {k: int(ca_f[v].sum())
              for k, v in {"Data": CAT_DATA, "Voice": CAT_VOICE,
                           "Other": CAT_OTHER}.items()
              if v in ca_f.columns}
        if sv:
            fig_p = go.Figure(go.Pie(
                labels=list(sv.keys()), values=list(sv.values()),
                hole=0.60, textinfo="percent+label",
                marker=dict(colors=[C["blue"], C["red"], C["gray"]]),
                textfont=dict(size=13),
            ))
            fig_p.update_layout(**PL, height=300, showlegend=True,
                legend=dict(orientation="h", y=-0.1))
            st.plotly_chart(fig_p, use_container_width=True)

    # Regional bar
    sec("📍 Complaints by Region")
    rt = ca_f.groupby("region")["total_complaints"] \
             .sum().sort_values(ascending=True).reset_index()
    fig_b = px.bar(rt, x="total_complaints", y="region", orientation="h",
                   color="total_complaints",
                   color_continuous_scale=[[0,"#FDE8EC"],[0.5,"#E87A8A"],
                                           [1,"#CF0A2C"]],
                   text="total_complaints")
    fig_b.update_traces(texttemplate="%{text:,}", textposition="outside",
                        textfont_size=10)
    fig_b.update_layout(**PL, height=420, coloraxis_showscale=False)
    st.plotly_chart(fig_b, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 2 — COMPLAINT MAP
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "🗺️  Complaint Map":
    brand_header("Complaint Map",
                 "City-level interactive hotspot — click to expand",
                 badges=["Tunisia", "257 cities", "MarkerCluster"])
    from src.dashboard.complaint_map import render_complaint_map
    render_complaint_map(complaints_clean, kpi_agg)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 3 — ANOMALY FEED
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "🚨  Anomaly Feed":
    brand_header("Anomaly Detection Feed",
                 "Isolation Forest + Statistical control charts",
                 badges=["Real-time", "2 models", "Consensus alerts"])

    if an_f.empty:
        st.warning("No anomaly data. Run anomaly_detector.run() first.")
        st.stop()

    total_a  = int(an_f["anomaly_flag"].sum())
    consensus= int(an_f["anomaly_consensus"].sum()) \
               if "anomaly_consensus" in an_f.columns else 0
    high_sev = int((an_f["if_severity"] == "High").sum()) \
               if "if_severity" in an_f.columns else 0
    rate     = an_f["anomaly_flag"].mean() * 100

    c1,c2,c3,c4 = st.columns(4)
    for col, val, lbl, color in [
        (c1, f"{total_a:,}",   "Total Anomalies",  C["red"]),
        (c2, f"{high_sev:,}",  "High Severity",    C["red"]),
        (c3, f"{consensus:,}", "Consensus (Both)", C["amber"]),
        (c4, f"{rate:.1f}%",   "Anomaly Rate",     C["gray"]),
    ]:
        col.markdown(f"""
        <div class="kpi-card" style="border-top-color:{color}">
            <div class="kpi-label">{lbl}</div>
            <div class="kpi-value" style="color:{color};font-size:24px">{val}</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    cl, cr = st.columns([2, 1])

    with cl:
        sec("📈 Anomaly Score Timeline")
        sr = st.selectbox("Region", sorted(an_f["region"].unique()))
        ra = an_f[an_f["region"] == sr].sort_values("date")
        fig_al = go.Figure()
        fig_al.add_trace(go.Scatter(
            x=ra["date"], y=ra["combined_score"],
            mode="lines", fill="tozeroy",
            line=dict(color=C["purple"], width=1.8),
            fillcolor="rgba(124,58,237,0.07)", name="Score"
        ))
        ap = ra[ra["anomaly_flag"] == 1]
        fig_al.add_trace(go.Scatter(
            x=ap["date"], y=ap["combined_score"],
            mode="markers", name="Anomaly",
            marker=dict(color=C["red"], size=9, symbol="x-thin",
                        line=dict(width=2.5))
        ))
        fig_al.update_layout(**PL, height=270)
        st.plotly_chart(fig_al, use_container_width=True)

        sec("🗒️ Recent Events")
        sf = st.multiselect("Severity", ["High","Medium","Low"],
                             default=["High","Medium"])
        ev = an_f[an_f["anomaly_flag"] == 1].copy()
        if "if_severity" in ev.columns and sf:
            ev = ev[ev["if_severity"].isin(sf)]
        ev = ev.sort_values("date", ascending=False).head(50)
        if not ev.empty:
            dc = [c for c in ["date","region","if_severity","combined_score",
                               "top_anomaly_driver","anomaly_consensus"]
                  if c in ev.columns]
            ed = ev[dc].copy()
            if "combined_score" in ed.columns:
                ed["combined_score"] = ed["combined_score"].round(3)
            if "date" in ed.columns:
                ed["date"] = ed["date"].dt.strftime("%Y-%m-%d")
            st.dataframe(ed, use_container_width=True, hide_index=True)

    with cr:
        sec("🌍 By Region")
        br = (an_f[an_f["anomaly_flag"]==1].groupby("region")["anomaly_flag"]
              .sum().sort_values(ascending=False).reset_index())
        fig_rp = go.Figure(go.Pie(
            labels=br["region"], values=br["anomaly_flag"],
            hole=0.55, textinfo="percent",
            marker=dict(colors=px.colors.sequential.Reds_r[:len(br)])
        ))
        fig_rp.update_layout(**PL, height=280, showlegend=False)
        st.plotly_chart(fig_rp, use_container_width=True)

        sec("🔍 KPI Drivers")
        if "top_anomaly_driver" in an_f.columns:
            dr = (an_f[an_f["anomaly_flag"]==1]["top_anomaly_driver"]
                  .value_counts().head(8).reset_index())
            dr.columns = ["KPI","Count"]
            dr["KPI"] = dr["KPI"].str.replace("_"," ").str.title()
            fig_dr = px.bar(dr, x="Count", y="KPI", orientation="h",
                            color="Count",
                            color_continuous_scale=[[0,"#FDE8EC"],[1,"#CF0A2C"]])
            fig_dr.update_layout(**PL, height=300, coloraxis_showscale=False)
            st.plotly_chart(fig_dr, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 4 — FORECASTING
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "📈  Forecasting":
    brand_header("Complaint Volume Forecasting",
                 "ARIMA · Prophet · XGBoost — 7-day ahead predictions",
                 badges=["24 Regions","3 Models","MAE optimised"])

    if forecasts.empty:
        st.warning("No forecast data. Run spike_predictor.run() first.")
        st.stop()

    sec("🏆 Model Performance — MAE by Region")
    if not pred_scores.empty:
        pv = pred_scores.pivot(index="region", columns="model", values="mae").round(2)
        st.dataframe(
            pv.style.highlight_min(axis=1, color="#D1FAE5")
                    .highlight_max(axis=1, color="#FEE2E2"),
            use_container_width=True
        )

    sec("📅 7-Day Forecast by Region")
    fc_r  = sorted(forecasts["region"].unique())
    sel_f = st.multiselect("Regions", fc_r, default=fc_r[:4])

    if sel_f:
        for ri in range((len(sel_f) + 1) // 2):
            cols = st.columns(2)
            for ci in range(2):
                idx = ri * 2 + ci
                if idx >= len(sel_f):
                    break
                reg = sel_f[idx]
                hist = (complaint_agg[complaint_agg["region"] == reg]
                        .sort_values("date").tail(45))
                fc   = forecasts[forecasts["region"] == reg]
                mdl  = fc["model_used"].iloc[0].upper() if not fc.empty else "N/A"
                with cols[ci]:
                    fig = go.Figure()
                    fig.add_trace(go.Scatter(
                        x=hist["date"], y=hist["total_complaints"],
                        mode="lines", line=dict(color=C["blue"], width=1.8),
                        fill="tozeroy", fillcolor="rgba(26,115,232,0.06)",
                        name="Historical"
                    ))
                    if not fc.empty:
                        fig.add_trace(go.Scatter(
                            x=fc["date"], y=fc["forecast"],
                            mode="lines+markers",
                            line=dict(color=C["red"], width=2.2, dash="dash"),
                            marker=dict(size=7, symbol="diamond",
                                        color=C["red"],
                                        line=dict(color="white", width=1.5)),
                            name=f"Forecast ({mdl})"
                        ))
                        fig.add_vrect(
                            x0=fc["date"].min(), x1=fc["date"].max(),
                            fillcolor="rgba(207,10,44,0.04)",
                            layer="below", line_width=0
                        )
                    fig.update_layout(
                        **PL, height=240,
                        title=dict(text=reg.replace(" Gouvernorat",""),
                                   font=dict(size=13, color="#111827")),
                        legend=dict(font=dict(size=9), orientation="h",
                                    bgcolor="rgba(0,0,0,0)")
                    )
                    st.plotly_chart(fig, use_container_width=True)

    sec("📋 Forecast Summary — Next 7 Days")
    if not forecasts.empty:
        fs = (forecasts[forecasts["region"].isin(selected_regions)]
              .groupby("region")
              .agg(total=("forecast","sum"), avg=("forecast","mean"),
                   peak=("forecast","max"), model=("model_used","first"))
              .reset_index().sort_values("total", ascending=False).round(1))
        fs.columns = ["Region","Total (7d)","Avg/day","Peak","Model"]
        st.dataframe(fs, use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 5 — USER SEGMENTS
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "👥  User Segments":
    brand_header("Customer Experience Segmentation",
                 "K-Means clustering · PCA visualisation · Radar profiles",
                 badges=["Unsupervised ML","K-Means","DBSCAN"])

    if kmeans_users.empty or cluster_profiles.empty:
        st.warning("No clustering data. Run customer clustering module first.")
        st.stop()

    CC = [C["red"], C["blue"], C["amber"], C["purple"],
          C["green"], C["teal"]]
    ok = int(kmeans_users["kmeans_cluster"].nunique())

    sec("📊 Cluster Summary")
    cols = st.columns(min(ok, 4))
    for i, (_, row) in enumerate(cluster_profiles.iterrows()):
        cid   = int(row["kmeans_cluster"])
        n     = int(row["n_users"])
        pct   = row.get("pct", 0)
        color = CC[i % len(CC)]
        qc    = next((c for c in ["qoe_score_mean","data_qoe_score_mean"]
                      if c in row.index), None)
        qv    = f"{row[qc]:.1f}" if qc else "N/A"
        with cols[i % 4]:
            st.markdown(f"""
            <div class="kpi-card" style="border-top-color:{color}">
                <div class="kpi-label" style="color:{color}">Cluster {cid}</div>
                <div class="kpi-value" style="color:{color};font-size:22px">
                    {n:,}
                </div>
                <div class="kpi-unit">{pct}% of subscribers</div>
                <div class="kpi-delta" style="color:#6B7280;margin-top:6px">
                    QoE: {qv}
                </div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    cs, ck = st.columns([3, 2])
    with cs:
        sec("🔵 PCA Scatter")
        if "pca_x" in kmeans_users.columns:
            smp = kmeans_users.sample(min(3000, len(kmeans_users)), random_state=42)
            fig_sc = px.scatter(
                smp, x="pca_x", y="pca_y",
                color=smp["kmeans_cluster"].astype(str),
                color_discrete_sequence=CC, opacity=0.55,
                labels={"pca_x":"PC1","pca_y":"PC2","color":"Cluster"}
            )
            fig_sc.update_traces(marker=dict(size=4))
            fig_sc.update_layout(**PL, height=380)
            st.plotly_chart(fig_sc, use_container_width=True)

    with ck:
        sec("📡 KPI Radar")
        kmc = [c for c in cluster_profiles.columns
               if c.endswith("_mean") and "n_users" not in c][:6]
        if kmc:
            rdf = cluster_profiles[["kmeans_cluster"] + kmc].copy()
            for c in kmc:
                mn, mx = rdf[c].min(), rdf[c].max()
                rdf[c] = (rdf[c] - mn) / (mx - mn + 1e-9)
            theta = [c.replace("_mean","").replace("_"," ").title() for c in kmc]
            fig_r = go.Figure()
            for i, (_, row) in enumerate(rdf.iterrows()):
                vals = [row[c] for c in kmc] + [row[kmc[0]]]
                fig_r.add_trace(go.Scatterpolar(
                    r=vals, theta=theta + [theta[0]],
                    name=f"Cluster {int(row['kmeans_cluster'])}",
                    line=dict(color=CC[i % len(CC)], width=2),
                    fill="toself", fillcolor=CC[i % len(CC)], opacity=0.10,
                ))
            fig_r.update_layout(
                polar=dict(bgcolor="white",
                           radialaxis=dict(visible=True, range=[0,1],
                                          gridcolor="#E3E6EA"),
                           angularaxis=dict(gridcolor="#E3E6EA")),
                template="plotly_white", height=380,
                paper_bgcolor="white",
                margin=dict(l=20,r=20,t=20,b=20),
            )
            st.plotly_chart(fig_r, use_container_width=True)

    sec("🌍 Cluster × Region Distribution")
    if "region" in kmeans_users.columns:
        cross = (pd.crosstab(kmeans_users["region"],
                             kmeans_users["kmeans_cluster"],
                             normalize="index").mul(100).round(1))
        cross.columns = [f"Cluster {c}" for c in cross.columns]
        fig_cx = px.bar(
            cross.reset_index(), x="region",
            y=cross.columns.tolist(), barmode="stack",
            color_discrete_sequence=CC,
            labels={"value":"% of Users","region":"","variable":"Cluster"}
        )
        fig_cx.update_layout(**PL, height=320,
            legend=dict(orientation="h", yanchor="bottom", y=1.02))
        fig_cx.update_xaxes(tickangle=30, tickfont_size=10)
        st.plotly_chart(fig_cx, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 6 — NLP ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "🔤  NLP Analysis":
    brand_header("NLP Customer Voice Analysis",
                 "Arabic · French · English — real complaints, no synthetic data",
                 badges=["3 Languages","SQLite","localhost:8000/form"])
    from src.nlp.nlp_dashboard_tab import render_nlp_tab
    render_nlp_tab()