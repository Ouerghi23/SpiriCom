"""
NLP Dashboard Tab — Page 6
============================
Customer voice analysis : complaint text in Arabic / French / English.
Uses complaints_clean['complaint_category'] + sub-category as text source.

Dependencies (optional — degrades gracefully if absent):
    pip install wordcloud arabic-reshaper python-bidi
"""

from __future__ import annotations
import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

C = {
    "red":    "#CF0A2C",
    "blue":   "#1A73E8",
    "green":  "#0F9D58",
    "amber":  "#F59E0B",
    "purple": "#7C3AED",
    "gray":   "#6B7280",
}

PL = dict(
    template="plotly_white",
    paper_bgcolor="white",
    plot_bgcolor="#FAFAFA",
    font=dict(family="Segoe UI, Arial, sans-serif", color="#111827", size=12),
    margin=dict(l=0, r=0, t=32, b=0),
)


def render_nlp_tab() -> None:
    """Entry point called from app.py."""
    try:
        from src.dashboard.data_loader import load_all
        data = load_all()
        cc   = data.get("complaints_clean", pd.DataFrame())
    except Exception:
        cc = pd.DataFrame()

    if cc.empty:
        st.warning("No complaints data. Run notebook 02 first to generate "
                   "`data/processed/complaints_clean.parquet`.")
        return

    _render_overview(cc)
    st.markdown("---")
    _render_category_analysis(cc)
    st.markdown("---")
    _render_wordcloud_section(cc)
    st.markdown("---")
    _render_time_patterns(cc)
    st.markdown("---")
    _render_feedback_form()


# ── Section 1 — Overview stats ────────────────────────────────────────────────

def _render_overview(cc: pd.DataFrame) -> None:
    st.markdown(
        '<div style="color:#1C1C2E;font-size:14px;font-weight:700;'
        'border-left:4px solid #CF0A2C;padding-left:12px;margin:0 0 14px">'
        "📊 Complaint Text Overview</div>",
        unsafe_allow_html=True,
    )

    total      = len(cc)
    n_cats     = cc["complaint_category"].nunique() if "complaint_category" in cc.columns else 0
    n_regions  = cc["region"].nunique() if "region" in cc.columns else 0
    n_msisdns  = cc["msisdn"].nunique() if "msisdn" in cc.columns else 0

    c1, c2, c3, c4 = st.columns(4)
    for col, val, lbl in [
        (c1, f"{total:,}",    "Total Complaints"),
        (c2, f"{n_cats}",     "Unique Categories"),
        (c3, f"{n_regions}",  "Gouvernorats"),
        (c4, f"{n_msisdns:,}","Unique MSISDNs"),
    ]:
        col.markdown(f"""
        <div style="background:white;border:1px solid #E3E6EA;
                    border-radius:12px;padding:16px;text-align:center;
                    border-top:3px solid #CF0A2C">
            <div style="color:#6B7280;font-size:11px;font-weight:600;
                        text-transform:uppercase;letter-spacing:1px">{lbl}</div>
            <div style="color:#111827;font-size:24px;font-weight:700;margin:4px 0">{val}</div>
        </div>""", unsafe_allow_html=True)


# ── Section 2 — Category analysis ────────────────────────────────────────────

def _render_category_analysis(cc: pd.DataFrame) -> None:
    st.markdown(
        '<div style="color:#1C1C2E;font-size:14px;font-weight:700;'
        'border-left:4px solid #CF0A2C;padding-left:12px;margin:14px 0">'
        "🗂️ Complaint Category Analysis</div>",
        unsafe_allow_html=True,
    )

    if "complaint_category" not in cc.columns:
        st.info("complaint_category column not found.")
        return

    cl, cr = st.columns([3, 2])

    with cl:
        # Top 15 categories bar chart
        top_cats = (cc["complaint_category"]
                    .value_counts()
                    .head(15)
                    .reset_index())
        top_cats.columns = ["Category", "Count"]
        top_cats["Category"] = top_cats["Category"].str[:40]

        fig = px.bar(
            top_cats.sort_values("Count"),
            x="Count", y="Category",
            orientation="h",
            color="Count",
            color_continuous_scale=[[0, "#FDE8EC"], [0.5, "#E87A8A"],
                                    [1, "#CF0A2C"]],
            text="Count",
        )
        fig.update_traces(texttemplate="%{text:,}", textposition="outside",
                          textfont_size=9)
        fig.update_layout(**PL, height=460,
                          coloraxis_showscale=False,
                          title="Top 15 Complaint Categories")
        st.plotly_chart(fig, use_container_width=True)

    with cr:
        # Service type breakdown
        if "service_type" in cc.columns:
            svc = cc["service_type"].value_counts().reset_index()
            svc.columns = ["Service", "Count"]
            fig_p = go.Figure(go.Pie(
                labels=svc["Service"], values=svc["Count"],
                hole=0.55, textinfo="percent+label",
                marker=dict(colors=[C["blue"], C["red"],
                                    C["amber"], C["gray"]]),
                textfont=dict(size=12),
            ))
            fig_p.update_layout(**PL, height=260,
                                title="Service Type Split",
                                showlegend=False)
            st.plotly_chart(fig_p, use_container_width=True)

        # Category × Region heatmap (top 8 cats × top 8 regions)
        top8_cats    = cc["complaint_category"].value_counts().head(8).index
        top8_regions = cc["region"].value_counts().head(8).index if "region" in cc.columns else []

        if len(top8_cats) and len(top8_regions):
            ct = pd.crosstab(
                cc[cc["region"].isin(top8_regions)]["region"],
                cc[cc["complaint_category"].isin(top8_cats)]["complaint_category"],
            )
            ct.columns = [c[:20] for c in ct.columns]
            fig_h = px.imshow(
                ct, color_continuous_scale="Reds",
                labels=dict(color="Count"), aspect="auto",
            )
            fig_h.update_layout(**PL, height=280,
                                title="Region × Category Heatmap",
                                coloraxis_colorbar=dict(thickness=10))
            st.plotly_chart(fig_h, use_container_width=True)


# ── Section 3 — Word cloud ────────────────────────────────────────────────────

def _render_wordcloud_section(cc: pd.DataFrame) -> None:
    st.markdown(
        '<div style="color:#1C1C2E;font-size:14px;font-weight:700;'
        'border-left:4px solid #CF0A2C;padding-left:12px;margin:14px 0">'
        "☁️ Complaint Text Word Frequency</div>",
        unsafe_allow_html=True,
    )

    # Build text from complaint_category + complaint_subcategory
    text_cols = [c for c in ["complaint_category", "complaint_subcategory"]
                 if c in cc.columns]
    if not text_cols:
        st.info("No text columns found.")
        return

    # Word frequency bar chart (always works, no extra deps)
# Correction 1 - Convertir chaque série en une seule chaîne
    all_text = " ".join(
      " ".join(cc[col].dropna().astype(str).str.lower())
    for col in text_cols
    )
    # Tokenize (simple split, works for French/English DCLM labels)
    stopwords = {
        "de", "la", "le", "les", "du", "des", "un", "une", "et", "en",
        "à", "au", "sur", "par", "pour", "avec", "dans", "pas", "non",
        "of", "the", "and", "a", "in", "to", "is", "or", "other", "nan",
        "réseau", "network", "service",
    }
    words = [w.strip(".,;:'\"()[]") for w in all_text.split()
             if len(w) > 3 and w not in stopwords]
    freq  = pd.Series(words).value_counts().head(30).reset_index()
    freq.columns = ["Word", "Freq"]

    fig_wf = px.bar(
        freq.sort_values("Freq").tail(20),
        x="Freq", y="Word",
        orientation="h",
        color="Freq",
        color_continuous_scale=[[0, "#EDE9FE"], [1, "#7C3AED"]],
        text="Freq",
    )
    fig_wf.update_traces(texttemplate="%{text:,}", textposition="outside",
                         textfont_size=9)
    fig_wf.update_layout(**PL, height=480, coloraxis_showscale=False,
                         title="Top 20 Most Frequent Words in Complaint Text")
    st.plotly_chart(fig_wf, use_container_width=True)

    # Try word cloud if available
    try:
        from wordcloud import WordCloud
        import matplotlib.pyplot as plt
        import io

        freq_dict = dict(zip(freq["Word"], freq["Freq"]))
        wc = WordCloud(
            width=800, height=320,
            background_color="white",
            colormap="Reds",
            max_words=80,
        ).generate_from_frequencies(freq_dict)

        fig_wc, ax = plt.subplots(figsize=(10, 4))
        ax.imshow(wc, interpolation="bilinear")
        ax.axis("off")
        buf = io.BytesIO()
        fig_wc.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        buf.seek(0)
        plt.close(fig_wc)
        st.image(buf, caption="Word Cloud — Complaint Categories", width=700)
    except ImportError:
        st.caption("Install `wordcloud` for word cloud visualisation: "
                   "`pip install wordcloud`")


# ── Section 4 — Temporal patterns ────────────────────────────────────────────

def _render_time_patterns(cc: pd.DataFrame) -> None:
    st.markdown(
        '<div style="color:#1C1C2E;font-size:14px;font-weight:700;'
        'border-left:4px solid #CF0A2C;padding-left:12px;margin:14px 0">'
        "⏰ Temporal Patterns</div>",
        unsafe_allow_html=True,
    )

    if "timestamp" not in cc.columns:
        st.info("timestamp column not found.")
        return

    ts = pd.to_datetime(cc["timestamp"])
    cc2 = cc.copy()
    cc2["hour"]    = ts.dt.hour
    cc2["weekday"] = ts.dt.day_name()
    cc2["month"]   = ts.dt.strftime("%b %Y")

    cl, cr = st.columns(2)

    with cl:
        # Hourly distribution
        hourly = cc2.groupby("hour").size().reset_index(name="count")
        fig_h = px.bar(
            hourly, x="hour", y="count",
            color="count",
            color_continuous_scale=[[0, "#FDE8EC"], [1, "#CF0A2C"]],
            labels={"hour": "Hour of Day", "count": "Complaints"},
        )
        fig_h.update_layout(**PL, height=280, coloraxis_showscale=False,
                            title="Complaints by Hour of Day")
        fig_h.update_xaxes(tickmode="linear", dtick=2)
        st.plotly_chart(fig_h, use_container_width=True)

    with cr:
        # Day of week
        dow_order = ["Monday", "Tuesday", "Wednesday",
                     "Thursday", "Friday", "Saturday", "Sunday"]
        dow = (cc2.groupby("weekday").size()
               .reindex(dow_order, fill_value=0)
               .reset_index(name="count"))
        fig_d = px.bar(
            dow, x="weekday", y="count",
            color="count",
            color_continuous_scale=[[0, "#E0F2FE"], [1, "#1A73E8"]],
            labels={"weekday": "Day", "count": "Complaints"},
        )
        fig_d.update_layout(**PL, height=280, coloraxis_showscale=False,
                            title="Complaints by Day of Week")
        st.plotly_chart(fig_d, use_container_width=True)

    # Heatmap hour × weekday
    pivot = pd.crosstab(cc2["hour"], cc2["weekday"])
    pivot = pivot.reindex(columns=dow_order, fill_value=0)
    fig_hw = px.imshow(
        pivot, color_continuous_scale="Reds",
        labels=dict(x="Day", y="Hour", color="Complaints"),
        aspect="auto",
    )
    fig_hw.update_layout(**PL, height=340,
                         title="Complaint Heatmap — Hour × Day of Week",
                         coloraxis_colorbar=dict(thickness=10))
    st.plotly_chart(fig_hw, use_container_width=True)


# ── Section 5 — Feedback form ─────────────────────────────────────────────────

def _render_feedback_form() -> None:
    st.markdown(
        '<div style="color:#1C1C2E;font-size:14px;font-weight:700;'
        'border-left:4px solid #CF0A2C;padding-left:12px;margin:14px 0">'
        "📝 Submit Field Observation</div>",
        unsafe_allow_html=True,
    )
    st.caption(
        "Engineers can submit field observations directly from the dashboard. "
        "Data is saved locally to `data/feedback/field_observations.csv`."
    )

    with st.form("field_observation_form"):
        c1, c2 = st.columns(2)
        with c1:
            region = st.selectbox("Gouvernorat", [
                "Tunis Gouvernorat", "Sfax Gouvernorat", "Sousse Gouvernorat",
                "Ariana Gouvernorat", "Ben Arous Gouvernorat", "Nabeul Gouvernorat",
                "Bizerte Gouvernorat", "Béja Gouvernorat", "Jendouba Gouvernorat",
                "Kairouan Gouvernorat", "Kasserine Gouvernorat", "Gafsa Gouvernorat",
                "Gabès Gouvernorat", "Mednine Gouvernorat", "Monastir Gouvernorat",
                "Other",
            ])
            issue_type = st.selectbox("Issue Type", [
                "Data Performance", "Voice Quality", "Coverage Gap",
                "Equipment Failure", "Network Congestion", "Other",
            ])
        with c2:
            cell_id    = st.text_input("Cell ID (optional)", placeholder="e.g. CELL_0042")
            severity   = st.select_slider(
                "Severity", ["Low", "Medium", "High", "Critical"]
            )

        description = st.text_area(
            "Description",
            placeholder="Describe the network issue observed on-site...",
            height=100,
        )
        photo_note = st.text_input(
            "Photo reference (optional)",
            placeholder="e.g. photo_ariana_20250614.jpg",
        )

        submitted = st.form_submit_button("Submit Observation", type="primary")

    if submitted and description:
        import csv, datetime
        out_dir = Path("data/feedback")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "field_observations.csv"
        row = {
            "timestamp":   datetime.datetime.now().isoformat(),
            "region":      region,
            "cell_id":     cell_id,
            "issue_type":  issue_type,
            "severity":    severity,
            "description": description,
            "photo_ref":   photo_note,
        }
        file_exists = out_file.exists()
        with open(out_file, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=row.keys())
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)
        st.success(f"✓ Observation submitted for {region} — saved to `{out_file}`")

    elif submitted:
        st.warning("Please add a description before submitting.")