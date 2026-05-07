"""
Complaint Map — Page 2
=======================
Interactive Folium map with city-level complaint hotspots.
Requires: folium, streamlit-folium
    pip install folium streamlit-folium
"""

from __future__ import annotations
import pandas as pd
import numpy as np
import streamlit as st

# Tunisia gouvernorat centroids
GOVERNORATE_COORDS = {
    "Tunis Gouvernorat":         (36.818, 10.165),
    "Ariana Gouvernorat":        (36.862, 10.193),
    "Ben Arous Gouvernorat":     (36.747, 10.228),
    "Manouba Gouvernorat":       (36.810, 10.098),
    "Nabeul Gouvernorat":        (36.453, 10.737),
    "Zaghouan Gouvernorat":      (36.402, 10.143),
    "Bizerte Gouvernorat":       (37.274, 9.873),
    "Béja Gouvernorat":          (36.726, 9.181),
    "Jendouba Gouvernorat":      (36.501, 8.778),
    "Kef Gouvernorat":           (36.167, 8.714),
    "Siliana Gouvernorat":       (36.084, 9.371),
    "Sousse Gouvernorat":        (35.826, 10.636),
    "Monastir Gouvernorat":      (35.764, 10.811),
    "Mahdia Gouvernorat":        (35.504, 11.062),
    "Sfax Gouvernorat":          (34.739, 10.760),
    "Kairouan Gouvernorat":      (35.677, 10.098),
    "Kasserine Gouvernorat":     (35.172, 8.831),
    "Sidi Bouzid Gouvernorat":   (35.038, 9.485),
    "Gabès Gouvernorat":         (33.882, 9.988),
    "Mednine Gouvernorat":       (33.354, 10.505),
    "Tataouine Gouvernorat":     (32.930, 10.452),
    "Gafsa Gouvernorat":         (34.425, 8.784),
    "Tozeur Gouvernorat":        (33.920, 8.123),
    "Kebili Gouvernorat":        (33.705, 8.968),
}


def render_complaint_map(
    complaints_clean: pd.DataFrame,
    kpi_agg: pd.DataFrame,
) -> None:
    """Render interactive complaint hotspot map."""

    try:
        import folium
        from streamlit_folium import st_folium
        HAS_FOLIUM = True
    except ImportError:
        HAS_FOLIUM = False

    # ── Controls ──────────────────────────────────────────────────────────────
    col1, col2, col3 = st.columns(3)
    with col1:
        service_filter = st.selectbox(
            "Service Type", ["All", "Data", "Voice"], index=0
        )
    with col2:
        metric = st.selectbox(
            "Bubble size", ["Total Complaints", "High Priority", "Unique MSISDNs"]
        )
    with col3:
        show_qoe = st.toggle("Overlay QoE color", value=True)

    # ── Aggregate by region ───────────────────────────────────────────────────
    cc = complaints_clean.copy()
    if service_filter != "All" and "service_type" in cc.columns:
        cc = cc[cc["service_type"] == service_filter]

    if cc.empty:
        st.warning("No data for selected filters.")
        return

    # Group complaints
    grp = cc.groupby("region").agg(
        total_complaints=("case_id", "count"),
        unique_msisdns=("msisdn", "nunique"),
    ).reset_index()

    # High priority
    if "priority" in cc.columns:
        hp = cc[cc["priority"].isin(["Critical", "High"])].groupby("region").size()
        grp["high_priority"] = grp["region"].map(hp).fillna(0).astype(int)
    else:
        grp["high_priority"] = 0

    # QoE from kpi_agg
    if show_qoe and not kpi_agg.empty:
        qoe_col = next(
            (c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in kpi_agg.columns),
            None,
        )
        if qoe_col:
            qoe_by_region = kpi_agg.groupby("region")[qoe_col].mean()
            grp["qoe"] = grp["region"].map(qoe_by_region).fillna(70)
        else:
            grp["qoe"] = 70
    else:
        grp["qoe"] = 70

    # Add coordinates
    grp["lat"] = grp["region"].map(lambda r: GOVERNORATE_COORDS.get(r, (35.0, 9.0))[0])
    grp["lon"] = grp["region"].map(lambda r: GOVERNORATE_COORDS.get(r, (35.0, 9.0))[1])

    # Bubble value
    val_map = {
        "Total Complaints": "total_complaints",
        "High Priority":    "high_priority",
        "Unique MSISDNs":   "unique_msisdns",
    }
    val_col = val_map[metric]

    if not HAS_FOLIUM:
        # ── Fallback — Plotly scatter geo ──────────────────────────────────────
        st.info("Install `folium` and `streamlit-folium` for the interactive map. "
                "Showing Plotly fallback.")
        _render_plotly_map(grp, val_col, show_qoe)
        return

    # ── Folium map ─────────────────────────────────────────────────────────────
    m = folium.Map(
        location=[34.0, 9.5],
        zoom_start=6,
        tiles="CartoDB positron",
    )

    max_val = grp[val_col].max() or 1
    for _, row in grp.iterrows():
        val   = row[val_col]
        radius = 8 + 40 * (val / max_val) ** 0.5

        # Color by QoE
        if show_qoe:
            qoe = row["qoe"]
            if qoe >= 80:
                color = "#0F9D58"
            elif qoe >= 60:
                color = "#F59E0B"
            else:
                color = "#CF0A2C"
        else:
            color = "#CF0A2C"

        popup_html = f"""
        <div style="font-family:sans-serif;min-width:180px">
            <b style="color:#CF0A2C">{row['region']}</b><br>
            <hr style="margin:4px 0">
            Total plaintes : <b>{row['total_complaints']:,}</b><br>
            Haute priorité : <b>{row['high_priority']:,}</b><br>
            MSISDNs uniques: <b>{row['unique_msisdns']:,}</b><br>
            QoE moyen      : <b style="color:{color}">{row['qoe']:.1f}</b>
        </div>
        """

        folium.CircleMarker(
            location=[row["lat"], row["lon"]],
            radius=radius,
            color="white",
            weight=1.5,
            fill=True,
            fill_color=color,
            fill_opacity=0.75,
            popup=folium.Popup(popup_html, max_width=220),
            tooltip=f"{row['region']}: {val:,}",
        ).add_to(m)

        # Label
        folium.Marker(
            location=[row["lat"], row["lon"]],
            icon=folium.DivIcon(
                html=f'<div style="font-size:9px;color:#111;'
                     f'font-weight:600;text-shadow:0 0 3px white">'
                     f'{row["region"].replace(" Gouvernorat","")}</div>',
                icon_size=(80, 20),
                icon_anchor=(40, 0),
            ),
        ).add_to(m)

    # Legend
    legend = """
    <div style="position:fixed;bottom:30px;left:30px;z-index:1000;
                background:white;padding:12px 16px;border-radius:8px;
                border:1px solid #ddd;font-size:12px;font-family:sans-serif">
        <b>QoE Color</b><br>
        <span style="color:#0F9D58">●</span> Good (≥80)<br>
        <span style="color:#F59E0B">●</span> Fair (60–80)<br>
        <span style="color:#CF0A2C">●</span> Poor (&lt;60)<br>
        <br><i>Bubble size = {metric}</i>
    </div>
    """.format(metric=metric)
    m.get_root().html.add_child(folium.Element(legend))

    st_folium(m, width=None, height=560, returned_objects=[])

    # ── Summary table ──────────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("**Top 10 régions par volume de plaintes**")
    top10 = grp.sort_values("total_complaints", ascending=False).head(10)
    top10 = top10[["region", "total_complaints", "high_priority",
                   "unique_msisdns", "qoe"]].round(1)
    top10.columns = ["Région", "Plaintes", "Haute Priorité",
                     "MSISDNs", "QoE Moy."]
    st.dataframe(top10, use_container_width=True, hide_index=True)


def _render_plotly_map(grp: pd.DataFrame, val_col: str, show_qoe: bool) -> None:
    """Plotly fallback when folium not available."""
    import plotly.express as px
    import plotly.graph_objects as go

    grp = grp.copy()
    grp["size_norm"] = grp[val_col] / grp[val_col].max() * 40 + 5

    if show_qoe:
        grp["color_val"] = grp["qoe"]
        color_scale = "RdYlGn"
        color_label = "QoE"
    else:
        grp["color_val"] = grp[val_col]
        color_scale = "Reds"
        color_label = val_col.replace("_", " ").title()

    fig = go.Figure()
    fig.add_trace(go.Scattergeo(
        lat=grp["lat"],
        lon=grp["lon"],
        mode="markers+text",
        marker=dict(
            size=grp["size_norm"],
            color=grp["color_val"],
            colorscale=color_scale,
            showscale=True,
            colorbar=dict(title=color_label, thickness=12),
            line=dict(color="white", width=1),
        ),
        text=grp["region"].str.replace(" Gouvernorat", ""),
        textposition="top center",
        textfont=dict(size=9),
        customdata=grp[["total_complaints", "high_priority", "qoe"]].values,
        hovertemplate=(
            "<b>%{text}</b><br>"
            "Plaintes : %{customdata[0]:,}<br>"
            "Haute priorité : %{customdata[1]:,}<br>"
            "QoE : %{customdata[2]:.1f}<extra></extra>"
        ),
    ))

    fig.update_geos(
        scope="africa",
        center=dict(lat=34.0, lon=9.5),
        projection_scale=8,
        showland=True, landcolor="#F4F6F9",
        showcoastlines=True, coastlinecolor="#CBD5E1",
        showborders=True, bordercolor="#CBD5E1",
        showframe=False,
    )
    fig.update_layout(
        height=520,
        paper_bgcolor="white",
        margin=dict(l=0, r=0, t=0, b=0),
        geo=dict(bgcolor="white"),
    )
    st.plotly_chart(fig, use_container_width=True)