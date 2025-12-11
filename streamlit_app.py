#!/usr/bin/env python3
"""
Streamlit dashboard for eval_results repeatability/variability.

Usage:
    streamlit run streamlit_app.py

Required env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with insert/read access)

Optional filters via UI; defaults pull all rows (capped by MAX_ROWS).
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd
import streamlit as st
from supabase import Client, create_client

MAX_ROWS = 50000

# Set page config early to avoid Streamlit warnings
st.set_page_config(page_title="Eval Repeatability Dashboard", layout="wide")


@st.cache_resource
def load_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required")
    return create_client(url, key)


def _parse_raw_output(raw_output: Any) -> Dict[str, Any]:
    if raw_output is None:
        return {}
    if isinstance(raw_output, str):
        try:
            return json.loads(raw_output)
        except json.JSONDecodeError:
            return {}
    if isinstance(raw_output, dict):
        return raw_output
    return {}


def _extract_confidence(raw_output: Dict[str, Any]) -> Optional[str]:
    result = raw_output.get("result") if isinstance(raw_output, dict) else None
    if isinstance(result, dict):
        for key in ("confidence", "confidence_level"):
            val = result.get(key)
            if val:
                return str(val).strip().lower()
    return None


def _extract_run_mode(raw_output: Dict[str, Any]) -> Optional[str]:
    run_mode = raw_output.get("run_mode") if isinstance(raw_output, dict) else None
    if run_mode:
        return str(run_mode).strip().lower()
    return None


@st.cache_data(ttl=60)
def fetch_eval_results(
    batch_ids: Optional[List[str]] = None,
    config_labels: Optional[List[str]] = None,
    doc_ids: Optional[List[str]] = None,
) -> pd.DataFrame:
    client = load_supabase_client()
    query = client.table("eval_results").select("*")

    if batch_ids:
        query = query.in_("batch_id", batch_ids)
    if config_labels:
        query = query.in_("config_label", config_labels)
    if doc_ids:
        query = query.in_("doc_id", doc_ids)

    response = query.limit(MAX_ROWS).execute()
    data = getattr(response, "data", None) or []
    df = pd.DataFrame(data)
    if df.empty:
        return df

    parsed = df["raw_output"].apply(_parse_raw_output)
    df["confidence"] = parsed.apply(_extract_confidence)
    df["run_mode"] = parsed.apply(_extract_run_mode)
    return df


def compute_repeatability(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    records: List[Dict[str, Any]] = []
    for (doc_id, requirement_id, config_label), group in df.groupby(["doc_id", "requirement_id", "config_label"]):
        labels = group["model_label"].fillna("UNKNOWN")
        label_counts = labels.value_counts()
        mode_label = label_counts.idxmax()
        repeatability = label_counts.max() / len(labels)
        label_spread = ", ".join(f"{k}:{v}" for k, v in label_counts.items())

        confs = group["confidence"].dropna()
        conf_mode: Optional[str] = None
        conf_repeat: Optional[float] = None
        if not confs.empty:
            conf_counts = confs.value_counts()
            conf_mode = conf_counts.idxmax()
            conf_repeat = conf_counts.max() / len(confs)

        records.append(
            {
                "doc_id": doc_id,
                "requirement_id": requirement_id,
                "config_label": config_label,
                "runs": len(labels),
                "mode_label": mode_label,
                "repeatability": repeatability,
                "label_spread": label_spread,
                "confidence_mode": conf_mode,
                "confidence_repeat": conf_repeat,
                "batches": ", ".join(sorted(group["batch_id"].dropna().unique())),
                "run_modes": ", ".join(sorted(group["run_mode"].dropna().unique())),
            }
        )
    metrics = pd.DataFrame(records)
    return metrics.sort_values(by=["repeatability", "requirement_id"])


def compute_batch_deltas(df: pd.DataFrame, baseline_batch: str, compare_batch: str) -> pd.DataFrame:
    base = compute_repeatability(df[df["batch_id"] == baseline_batch])
    comp = compute_repeatability(df[df["batch_id"] == compare_batch])
    if base.empty or comp.empty:
        return pd.DataFrame()

    merged = base.merge(
        comp,
        on=["doc_id", "requirement_id", "config_label"],
        suffixes=("_base", "_new"),
    )
    merged["delta_repeatability"] = merged["repeatability_new"] - merged["repeatability_base"]
    merged["delta_confidence_repeat"] = merged["confidence_repeat_new"] - merged["confidence_repeat_base"]
    return merged.sort_values(by="delta_repeatability")


def _multiselect(label: str, options: Iterable[str], default: Optional[Iterable[str]] = None) -> List[str]:
    opts = sorted({opt for opt in options if opt})
    default_list = [d for d in (default or []) if d in opts]
    return st.multiselect(label, opts, default=default_list)


def main() -> None:
    st.title("Eval Repeatability Dashboard")
    st.caption("Focus: precision/repeatability across runs (label and confidence stability).")

    with st.sidebar:
        st.header("Filters")
        st.write("Select subsets before loading data.")
        batch_prefill = st.text_input("Batch IDs (comma-separated, optional)")
        config_prefill = st.text_input("Config labels (comma-separated, optional)")
        doc_prefill = st.text_input("Doc IDs (comma-separated, optional)")
        run_mode_filter = st.selectbox("Run mode filter", ["all", "precision", "accuracy", "other"], index=0)
        load_button = st.button("Load / Refresh data", type="primary")

    batch_ids = [b.strip() for b in batch_prefill.split(",") if b.strip()]
    config_labels = [c.strip() for c in config_prefill.split(",") if c.strip()]
    doc_ids = [d.strip() for d in doc_prefill.split(",") if d.strip()]

    if not load_button:
        st.info("Set filters (optional) and click **Load / Refresh data** to fetch eval results.")
        st.stop()

    with st.spinner("Fetching eval_results..."):
        df = fetch_eval_results(batch_ids=batch_ids or None, config_labels=config_labels or None, doc_ids=doc_ids or None)

    if df.empty:
        st.warning("No eval_results found for the provided filters.")
        st.stop()

    if run_mode_filter != "all":
        if run_mode_filter == "other":
            df = df[df["run_mode"].isna() | ~df["run_mode"].isin(["precision", "accuracy"])]
        else:
            df = df[df["run_mode"] == run_mode_filter]
        if df.empty:
            st.warning("No rows match the selected run mode filter.")
            st.stop()

    st.success(f"Loaded {len(df)} rows | docs: {df['doc_id'].nunique()} | requirements: {df['requirement_id'].nunique()} | batches: {df['batch_id'].nunique()}")
    st.markdown(f"Last fetch: {datetime.utcnow().isoformat()}Z")

    metrics = compute_repeatability(df)
    if metrics.empty:
        st.warning("Insufficient data to compute repeatability.")
        st.stop()

    variable = metrics[metrics["repeatability"] < 1.0]
    stable = metrics[metrics["repeatability"] >= 1.0]

    col1, col2, col3 = st.columns(3)
    col1.metric("Requirements evaluated", metrics["requirement_id"].nunique())
    col2.metric("Stable reqs (repeatability=1)", len(stable))
    col3.metric("Variable reqs (repeatability<1)", len(variable))

    st.subheader("Most variable requirements (lowest repeatability first)")
    st.dataframe(
        metrics.sort_values(by=["repeatability", "confidence_repeat"]).reset_index(drop=True),
        use_container_width=True,
        height=500,
    )

    st.subheader("Confidence stability (where available)")
    conf_variability = metrics[metrics["confidence_repeat"].notna()].sort_values(by="confidence_repeat")
    if conf_variability.empty:
        st.info("No confidence data available in raw_output.")
    else:
        st.dataframe(conf_variability.reset_index(drop=True), use_container_width=True, height=400)

    st.subheader("Batch comparison (optional)")
    all_batches = sorted(df["batch_id"].unique())
    col_base, col_cmp = st.columns(2)
    base_batch = col_base.selectbox("Baseline batch", ["(none)"] + all_batches, index=0)
    cmp_batch = col_cmp.selectbox("Comparison batch", ["(none)"] + all_batches, index=0)

    if base_batch != "(none)" and cmp_batch != "(none)":
        deltas = compute_batch_deltas(df, base_batch, cmp_batch)
        if deltas.empty:
            st.info("No overlapping requirements between the selected batches.")
        else:
            st.dataframe(
                deltas[
                    [
                        "doc_id",
                        "requirement_id",
                        "config_label",
                        "repeatability_base",
                        "repeatability_new",
                        "delta_repeatability",
                        "confidence_repeat_base",
                        "confidence_repeat_new",
                        "delta_confidence_repeat",
                    ]
                ].reset_index(drop=True),
                use_container_width=True,
                height=400,
            )
    else:
        st.caption("Select both a baseline and comparison batch to see deltas.")


if __name__ == "__main__":
    main()
