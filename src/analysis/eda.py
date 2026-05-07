# =============================================================================
# eda_visualizations.py
# EDA visualization functions — aligned with real complaint dataset columns:
#   Case ID, system, case open datetime, Type, msisdn, last status,
#   Provider Group, Typologie It/network, category, sub category,
#   sub sub category, province, city, Segment MSISDN CONCERN,
#   bscs_custcode, account contact name, Week
# =============================================================================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
from pathlib import Path
import yaml
from loguru import logger

# ---------------------------------------------------------------------------
# Config & paths
# ---------------------------------------------------------------------------
CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "config.yaml"
with open(CONFIG_PATH) as f:
    cfg = yaml.safe_load(f)

FIGURES_DIR = Path(cfg["paths"]["figures"])
FIGURES_DIR.mkdir(parents=True, exist_ok=True)

sns.set_theme(style="darkgrid", palette="husl")
COLORS = sns.color_palette("husl", 10)

# ---------------------------------------------------------------------------
# Column name mapping — real CSV names → internal names used below
# Adjust right-hand values if your CSV uses different exact spellings
# ---------------------------------------------------------------------------
COL = {
    "case_id":          "Case ID",
    "system":           "system",
    "timestamp":        "case open datetime",   # parsed to datetime in cleaning
    "type":             "Type",
    "msisdn":           "msisdn",
    "status":           "last status",
    "provider":         "Provider Group",
    "typology":         "Typologie It/network",
    "category":         "category",
    "subcategory":      "sub category",
    "subsubcategory":   "sub sub category",
    "province":         "province",
    "city":             "city",
    "segment":          "Segment MSISDN CONCERN",
    "custcode":         "bscs_custcode",
    "contact":          "account contact name",
    "week":             "Week",
    # Derived columns (added during feature engineering):
    "hour":             "hour",           # extracted from case open datetime
    "day_of_week":      "day_of_week",    # extracted from case open datetime
    "year":             "year",           # extracted from case open datetime
    "month":            "month",          # extracted from case open datetime
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _vc(series: pd.Series, col_name: str = "category") -> pd.DataFrame:
    """Safe value_counts → DataFrame. Works on pandas 1.x and 2.x."""
    vc = series.value_counts()
    return pd.DataFrame({col_name: vc.index, "count": vc.values})


def _save(fig: plt.Figure, name: str) -> None:
    path = FIGURES_DIR / name
    fig.savefig(path, dpi=150, bbox_inches="tight")
    logger.info(f"Figure saved → {path}")


def _col(df: pd.DataFrame, key: str) -> str | None:
    """Return the real column name if present, else None + warning."""
    real = COL.get(key, key)
    if real in df.columns:
        return real
    logger.warning(f"Column '{real}' (key='{key}') not found in DataFrame — skipping")
    return None


# ---------------------------------------------------------------------------
# Complaint EDA functions
# ---------------------------------------------------------------------------

def complaint_category_distribution(df: pd.DataFrame,
                                     save: bool = True) -> plt.Figure:
    """Bar chart: complaint volume by category (real column: 'category')."""
    col = _col(df, "category")
    if col is None:
        return plt.figure()

    counts = _vc(df[col], "category")

    fig, ax = plt.subplots(figsize=(12, 5))
    sns.barplot(data=counts, x="category", y="count", palette="husl", ax=ax)
    ax.set_title("Complaint Volume by Category", fontsize=14, fontweight="bold")
    ax.set_xlabel("Category")
    ax.set_ylabel("Number of Complaints")
    ax.tick_params(axis="x", rotation=35)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_category_distribution.png")
    return fig


def complaint_subcategory_top(df: pd.DataFrame,
                               n: int = 15,
                               save: bool = True) -> plt.Figure:
    """Top N sub-categories, optionally stacked by Type (Data / Voice).
    Uses real columns: 'sub category' and 'Type'.
    """
    col = _col(df, "subcategory")
    if col is None:
        return plt.figure()

    top_vals = df[col].value_counts().head(n).index
    sub = df[df[col].isin(top_vals)].copy()

    type_col = _col(df, "type")

    if type_col is not None:
        pivot = (sub.groupby([col, type_col])
                    .size()
                    .unstack(fill_value=0))
        fig, ax = plt.subplots(figsize=(11, 6))
        pivot.loc[[v for v in top_vals if v in pivot.index]].plot(
            kind="barh", ax=ax,
            color=[COLORS[0], COLORS[2]][:len(pivot.columns)],
            alpha=0.85,
        )
        ax.legend(title="Type (Data / Voice)")
    else:
        counts = _vc(sub[col], col)
        fig, ax = plt.subplots(figsize=(11, 6))
        ax.barh(counts[col], counts["count"], color=COLORS[0], alpha=0.85)

    ax.set_title(f"Top {n} Sub-Categories (sub category)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Count")
    plt.tight_layout()
    if save:
        _save(fig, "complaint_subcategory_top.png")
    return fig


def complaint_subsubcategory_top(df: pd.DataFrame,
                                  n: int = 15,
                                  save: bool = True) -> plt.Figure:
    """Top N sub-sub-categories — granular fault analysis.
    Real column: 'sub sub category'.
    """
    col = _col(df, "subsubcategory")
    if col is None:
        return plt.figure()

    counts = (_vc(df[col].dropna(), col)
              .head(n)
              .sort_values("count", ascending=True))

    fig, ax = plt.subplots(figsize=(11, max(5, n * 0.45)))
    ax.barh(counts[col], counts["count"],
            color=COLORS[1], alpha=0.85, edgecolor="none")
    ax.bar_label(ax.containers[0],
                 labels=[f"{int(v):,}" for v in counts["count"]],
                 padding=4, fontsize=8)
    ax.set_title(f"Top {n} Sub-Sub-Categories (sub sub category)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Count")
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_subsubcategory_top.png")
    return fig


def complaint_by_service_type(df: pd.DataFrame,
                               save: bool = True) -> plt.Figure:
    """Pie chart: complaints by Type (Data vs Voice). Real column: 'Type'."""
    col = _col(df, "type")
    if col is None:
        return plt.figure()

    counts = df[col].value_counts()
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.pie(counts, labels=counts.index, autopct="%1.1f%%",
           colors=COLORS[:len(counts)], startangle=140)
    ax.set_title("Complaints by Service Type (Data vs Voice)",
                 fontsize=14, fontweight="bold")
    plt.tight_layout()
    if save:
        _save(fig, "complaints_service_type_pie.png")
    return fig


def complaint_volume_over_time(df: pd.DataFrame,
                                freq: str = "W",
                                save: bool = True) -> plt.Figure:
    """Line chart: complaint volume resampled at given frequency.
    Requires 'case open datetime' parsed as datetime (done in cleaning step).
    """
    col = _col(df, "timestamp")
    if col is None:
        return plt.figure()

    if not pd.api.types.is_datetime64_any_dtype(df[col]):
        logger.warning(f"Column '{col}' is not datetime — attempting parse")
        df = df.copy()
        df[col] = pd.to_datetime(df[col], errors="coerce")

    ts = (df.set_index(col)
            .resample(freq)
            .size()
            .reset_index(name="count"))

    fig, ax = plt.subplots(figsize=(14, 4))
    ax.plot(ts[col], ts["count"], linewidth=1.5, color=COLORS[0])
    ax.fill_between(ts[col], ts["count"], alpha=0.15, color=COLORS[0])
    ax.set_title(f"Complaint Volume Over Time (freq={freq})",
                 fontsize=14, fontweight="bold")
    ax.set_xlabel("Date")
    ax.set_ylabel("Number of Complaints")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, f"complaint_volume_timeseries_{freq}.png")
    return fig


def complaint_heatmap_hour_day(df: pd.DataFrame,
                                save: bool = True) -> plt.Figure:
    """Heatmap: complaints by hour × day of week.
    Requires derived columns 'hour' and 'day_of_week'
    (extracted from 'case open datetime' during feature engineering).
    """
    h_col = _col(df, "hour")
    d_col = _col(df, "day_of_week")
    if h_col is None or d_col is None:
        return plt.figure()

    order = ["Monday", "Tuesday", "Wednesday",
             "Thursday", "Friday", "Saturday", "Sunday"]
    pivot = (df.groupby([d_col, h_col])
               .size()
               .unstack(fill_value=0)
               .reindex([d for d in order if d in df[d_col].unique()]))

    fig, ax = plt.subplots(figsize=(16, 5))
    sns.heatmap(pivot, cmap="YlOrRd", linewidths=0.3, ax=ax,
                cbar_kws={"label": "Complaint Count"})
    ax.set_title("Complaint Heatmap: Hour × Day of Week",
                 fontsize=14, fontweight="bold")
    ax.set_xlabel("Hour of Day")
    ax.set_ylabel("Day of Week")
    plt.tight_layout()
    if save:
        _save(fig, "complaint_heatmap_hour_day.png")
    return fig


def complaint_by_region(df: pd.DataFrame,
                         level: str = "province",
                         save: bool = True) -> plt.Figure:
    """Horizontal bar: complaints by province or city.
    level: 'province' or 'city' — both present in real data.
    """
    col = _col(df, level)  # key must match COL dict: 'province' or 'city'
    if col is None:
        return plt.figure()

    counts = df[col].value_counts().sort_values()
    fig, ax = plt.subplots(figsize=(9, max(5, len(counts) * 0.35)))
    counts.plot(kind="barh", ax=ax,
                color=[COLORS[i % len(COLORS)] for i in range(len(counts))])
    ax.set_title(f"Complaint Volume by {level.title()} ({col})",
                 fontsize=14, fontweight="bold")
    ax.set_xlabel("Number of Complaints")
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, f"complaints_by_{level}.png")
    return fig


def complaint_by_typology(df: pd.DataFrame,
                           save: bool = True) -> plt.Figure:
    """Bar chart: IT issues vs Network issues.
    Real column: 'Typologie It/network'.
    """
    col = _col(df, "typology")
    if col is None:
        return plt.figure()

    counts = _vc(df[col].dropna(), col)
    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(counts[col], counts["count"],
                  color=[COLORS[0], COLORS[2]][:len(counts)],
                  edgecolor="none", alpha=0.85)
    ax.bar_label(bars, labels=[f"{int(v):,}" for v in counts["count"]], padding=3)
    ax.set_title("Complaints: IT Issues vs Network Issues\n(Typologie It/network)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Typology")
    ax.set_ylabel("Count")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_by_typology.png")
    return fig


def complaint_by_resolution(df: pd.DataFrame,
                              top_n: int = 10,
                              save: bool = True) -> plt.Figure:
    """Horizontal bar: complaints by last status (resolution).
    Real column: 'last status'.
    """
    col = _col(df, "status")
    if col is None:
        return plt.figure()

    counts = (_vc(df[col].dropna(), col)
               .sort_values("count", ascending=True)
               .tail(top_n))

    n = len(counts)
    fig, ax = plt.subplots(figsize=(11, max(4, n * 0.55)))
    palette = [COLORS[i % len(COLORS)] for i in range(n)]
    bars = ax.barh(counts[col], counts["count"],
                   color=palette, edgecolor="none", alpha=0.85)

    ax.bar_label(bars,
                 labels=[f"{int(v):,}" for v in counts["count"]],
                 padding=5, fontsize=9)

    total = df[col].notna().sum()
    for bar, val in zip(bars, counts["count"]):
        pct = val / total * 100
        ax.text(bar.get_width() + counts["count"].max() * 0.015,
                bar.get_y() + bar.get_height() / 2,
                f"({pct:.1f}%)", va="center", fontsize=8, color="grey")

    ax.set_xlim(0, counts["count"].max() * 1.22)
    ax.set_title("Complaint Resolution Status (last status)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Number of Complaints")
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_by_resolution.png")
    return fig


def complaint_by_provider(df: pd.DataFrame,
                           save: bool = True) -> plt.Figure:
    """Bar chart: complaints by Provider Group. Real column: 'Provider Group'."""
    col = _col(df, "provider")
    if col is None:
        return plt.figure()

    counts = _vc(df[col].dropna(), col).sort_values("count", ascending=False)
    fig, ax = plt.subplots(figsize=(9, 4))
    sns.barplot(data=counts, x=col, y="count", palette="husl", ax=ax)
    ax.set_title("Complaints by Provider Group", fontsize=13, fontweight="bold")
    ax.set_xlabel("Provider Group")
    ax.set_ylabel("Count")
    ax.tick_params(axis="x", rotation=25)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_by_provider.png")
    return fig


def complaint_weekly_trend(df: pd.DataFrame,
                            save: bool = True) -> plt.Figure:
    """Line chart: weekly complaint volume.
    Uses 'Week' column directly if present (it's in your real data).
    Falls back to resampling 'case open datetime' if Week is missing.
    """
    week_col = _col(df, "week")

    # ── preferred path: use the 'Week' column already in the dataset ──
    if week_col is not None:
        year_col = _col(df, "year")   # derived column (may not exist yet)
        if year_col is not None:
            weekly = (df.groupby([year_col, week_col])
                        .size()
                        .reset_index(name="count"))
            weekly["label"] = (weekly[year_col].astype(str) + "-W"
                               + weekly[week_col].astype(str).str.zfill(2))
            weekly = weekly.sort_values([year_col, week_col])
        else:
            # No year column: just group by Week number (multi-year wraps)
            weekly = (df.groupby(week_col)
                        .size()
                        .reset_index(name="count"))
            weekly["label"] = "W" + weekly[week_col].astype(str).str.zfill(2)
            weekly = weekly.sort_values(week_col)

        fig, ax = plt.subplots(figsize=(14, 4))
        ax.plot(range(len(weekly)), weekly["count"],
                linewidth=1.5, color=COLORS[0], marker="o", markersize=3)
        ax.fill_between(range(len(weekly)), weekly["count"],
                        alpha=0.15, color=COLORS[0])

        tick_step = max(1, len(weekly) // 12)
        ax.set_xticks(range(0, len(weekly), tick_step))
        ax.set_xticklabels(weekly["label"].iloc[::tick_step],
                           rotation=40, ha="right", fontsize=8)
        ax.set_title("Weekly Complaint Volume (Week column)",
                     fontsize=14, fontweight="bold")
        ax.set_xlabel("Week")
        ax.set_ylabel("Complaints")
        ax.yaxis.set_major_formatter(
            mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
        plt.tight_layout()
        if save:
            _save(fig, "complaint_weekly_trend.png")
        return fig

    # ── fallback: resample timestamp ──
    logger.info("Week column not found — falling back to timestamp resampling")
    return complaint_volume_over_time(df, freq="W", save=save)


def complaint_segment_analysis(df: pd.DataFrame,
                                save: bool = True) -> plt.Figure:
    """Stacked bar: complaints by customer segment × service type.
    Real column: 'Segment MSISDN CONCERN'.
    """
    seg_col = _col(df, "segment")
    if seg_col is None:
        return plt.figure()

    type_col = _col(df, "type")
    if type_col is not None:
        pivot = (df.groupby([seg_col, type_col])
                   .size().unstack(fill_value=0))
    else:
        pivot = df.groupby(seg_col).size().to_frame("count")

    fig, ax = plt.subplots(figsize=(9, 5))
    pivot.plot(kind="bar", ax=ax, stacked=True,
               color=[COLORS[0], COLORS[2]][:len(pivot.columns)],
               alpha=0.85, edgecolor="none")
    ax.set_title("Complaints by Customer Segment (Segment MSISDN CONCERN)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Customer Segment")
    ax.set_ylabel("Complaints")
    ax.tick_params(axis="x", rotation=20)
    if type_col is not None:
        ax.legend(title="Type")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "complaint_segment_analysis.png")
    return fig


def missing_value_report(df: pd.DataFrame,
                          name: str = "Dataset") -> pd.DataFrame:
    """Returns a DataFrame listing columns with missing values, counts, and %."""
    total = len(df)
    missing = df.isnull().sum()
    pct = (missing / total * 100).round(2)
    report = (pd.DataFrame({
        "column":  missing.index,
        "missing": missing.values,
        "pct":     pct.values,
        "dtype":   [str(df[c].dtype) for c in missing.index],
    })
    .query("missing > 0")
    .sort_values("pct", ascending=False)
    .reset_index(drop=True))
    logger.info(f"{name}: {len(report)} columns with missing values")
    return report


# ---------------------------------------------------------------------------
# KPI EDA functions (synthetic data now, real KPI data later)
# ---------------------------------------------------------------------------

def kpi_distribution_plots(df: pd.DataFrame,
                            save: bool = True) -> plt.Figure:
    """Histogram grid for all KPI numeric columns.
    Works with synthetic data and will adapt automatically when real KPIs arrive.
    """
    exclude = {"hour", "month", "year", "week",
               "hour_sin", "hour_cos", "dow_sin", "dow_cos",
               "month_sin", "month_cos", "priority_encoded",
               "segment_encoded", "is_degraded_session"}

    # Prefer known KPI columns; fall back to all numerics
    target_cols = [
        "dl_throughput_mbps", "ul_throughput_mbps", "latency_ms",
        "packet_loss_pct", "data_session_success_rate", "data_qoe_score",
        "call_setup_success_rate", "call_drop_rate",
        "voice_quality_score_mos", "voice_qoe_score", "qoe_score",
    ]
    kpi_cols = [c for c in target_cols if c in df.columns]
    if not kpi_cols:
        kpi_cols = [c for c in df.select_dtypes(include="number").columns
                    if c not in exclude]
        logger.info(f"No standard KPI cols — using numeric cols: {kpi_cols}")

    if not kpi_cols:
        logger.warning("No numeric KPI columns found to plot")
        fig, ax = plt.subplots()
        ax.text(0.5, 0.5, "No numeric KPI columns available",
                ha="center", va="center")
        return fig

    ncols = min(3, len(kpi_cols))
    nrows = int(np.ceil(len(kpi_cols) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 4 * nrows))
    axes = np.array(axes).flatten()

    for i, col in enumerate(kpi_cols):
        data = df[col].dropna()
        if len(data) == 0:
            axes[i].set_visible(False)
            continue
        axes[i].hist(data, bins=50,
                     color=COLORS[i % len(COLORS)],
                     edgecolor="none", alpha=0.8)
        axes[i].set_title(col.replace("_", " ").title(), fontsize=10)
        axes[i].set_xlabel("Value")
        axes[i].set_ylabel("Count")

    for j in range(len(kpi_cols), len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("KPI Value Distributions", fontsize=14, fontweight="bold", y=1.01)
    plt.tight_layout()
    if save:
        _save(fig, "kpi_distributions.png")
    return fig


def kpi_by_network_type(df: pd.DataFrame,
                         kpi_cols: list[str] | None = None,
                         save: bool = True) -> plt.Figure:
    """Boxplot: KPI distributions split by network type (3G / 4G / 5G).
    kpi_cols: explicit list of KPIs to plot. If None, auto-detects top 4.
    """
    col = "network_type"
    if col not in df.columns:
        logger.info("network_type not found — only in DATA KPI sheet")
        return plt.figure()

    exclude = {"hour", "month", "year", "week", "hour_sin", "hour_cos"}
    if kpi_cols is None:
        kpi_cols = [c for c in df.select_dtypes(include="number").columns
                    if c not in exclude][:4]

    if not kpi_cols:
        logger.warning("No numeric KPI cols found for network type analysis")
        return plt.figure()

    fig, axes = plt.subplots(1, len(kpi_cols),
                              figsize=(5 * len(kpi_cols), 5))
    if len(kpi_cols) == 1:
        axes = [axes]

    for i, kpi in enumerate(kpi_cols):
        order = df.groupby(col)[kpi].median().sort_values().index
        sns.boxplot(data=df, x=col, y=kpi,
                    order=order, palette="husl", ax=axes[i])
        axes[i].set_title(kpi.replace("_", " ").title(), fontsize=11)
        axes[i].set_xlabel("Network Type")
        axes[i].tick_params(axis="x", rotation=20)

    fig.suptitle("KPI Distribution by Network Type (3G / 4G / 5G)",
                 fontsize=13, fontweight="bold")
    plt.tight_layout()
    if save:
        _save(fig, "kpi_by_network_type.png")
    return fig


def kpi_voice_issues(df: pd.DataFrame,
                      save: bool = True) -> plt.Figure:
    """Horizontal bar: distribution of voice issue types (VOICE KPI sheet)."""
    col = "voice_issue_type"
    if col not in df.columns:
        logger.info("voice_issue_type not found — only in VOICE KPI sheet")
        return plt.figure()

    counts = _vc(df[col].dropna(), col).head(12)
    fig, ax = plt.subplots(figsize=(11, 5))
    sns.barplot(data=counts, y=col, x="count",
                palette="Reds_r", ax=ax, orient="h")
    ax.set_title("Voice Issues Distribution (VOICE KPI sheet)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Count")
    ax.set_ylabel("Voice Issue Type")
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()
    if save:
        _save(fig, "kpi_voice_issues.png")
    return fig


def qoe_score_by_region(df: pd.DataFrame,
                         save: bool = True) -> plt.Figure:
    """Boxplot: QoE score distribution per province/region.
    Uses 'province' from complaint data if joined, or 'region' from KPI data.
    """
    # Accept both column names (complaint side uses 'province', KPI side 'region')
    region_col = next((c for c in ["province", "region"] if c in df.columns), None)
    qoe_col    = next((c for c in ["qoe_score", "data_qoe_score",
                                    "voice_qoe_score"] if c in df.columns), None)

    if qoe_col is None or region_col is None:
        logger.warning("qoe_score or province/region column not found — skipping")
        return plt.figure()

    fig, ax = plt.subplots(figsize=(12, 5))
    order = df.groupby(region_col)[qoe_col].median().sort_values().index
    sns.boxplot(data=df, x=region_col, y=qoe_col,
                order=order, palette="RdYlGn", ax=ax)
    ax.axhline(80, color="green",  linestyle="--", linewidth=1, label="Good (≥80)")
    ax.axhline(60, color="orange", linestyle="--", linewidth=1, label="Fair (≥60)")
    ax.set_title(f"QoE Score by Region ({qoe_col})",
                 fontsize=14, fontweight="bold")
    ax.set_xlabel(region_col.title())
    ax.set_ylabel("QoE Score")
    ax.tick_params(axis="x", rotation=25)
    ax.legend()
    plt.tight_layout()
    if save:
        _save(fig, "qoe_by_region_boxplot.png")
    return fig


def kpi_correlation_matrix(df: pd.DataFrame,
                             save: bool = True) -> plt.Figure:
    """Lower-triangle correlation heatmap for all KPI numeric columns."""
    exclude = {"hour", "month", "year", "week", "is_degraded_session",
               "hour_sin", "hour_cos", "dow_sin", "dow_cos",
               "month_sin", "month_cos", "priority_encoded",
               "segment_encoded"}
    kpi_cols = [c for c in df.select_dtypes(include="number").columns
                if c not in exclude]

    if len(kpi_cols) < 2:
        logger.warning("Not enough numeric columns for correlation matrix")
        return plt.figure()

    corr = df[kpi_cols].corr()
    fig, ax = plt.subplots(figsize=(max(8, len(kpi_cols)),
                                    max(6, len(kpi_cols) - 1)))
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt=".2f",
                cmap="coolwarm", center=0, linewidths=0.5,
                ax=ax, annot_kws={"size": 8})
    ax.set_title("KPI Correlation Matrix", fontsize=14, fontweight="bold")
    plt.tight_layout()
    if save:
        _save(fig, "kpi_correlation_matrix.png")
    return fig