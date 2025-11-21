"""
Hardcoded eval set and configuration label for repeatability testing.

Override values via environment variables when needed:
- EVAL_CONFIG_LABEL: string to stamp into eval_results.config_label
- EVAL_NUM_RUNS: number of runs per (doc, requirement)
- EVAL_DOCS_JSON: JSON string array of {"id": "...", "path": "..."} entries
- EVAL_REQUIREMENTS_JSON: JSON string array of requirement IDs
"""

from __future__ import annotations

import json
import os
from typing import Dict, List

# Default hardcoded eval set. Paths should be accessible to the evaluator
# (local filesystem, blob URL, or presigned URL depending on pipeline setup).
_DEFAULT_EVAL_DOCS: List[Dict[str, str]] = [
    {
        "id": "bad_rm_sop_example",
        "path": "docs/docs_for_eval/Bad RM SOP Example.pdf",  # local test doc
    },
]

# Subset of requirement IDs to exercise in repeatability runs.
_DEFAULT_EVAL_REQUIREMENTS: List[str] = [
    "ISO14971-4.1-01",
    "ISO14971-4.2-01",
    "ISO14971-4.2-02",
    "ISO14971-4.4-01",
    "ISO14971-4.4-02",
    "ISO14971-5.1-01",
    "ISO14971-5.2-01",
    "ISO14971-6.1-01",
    "ISO14971-6.2-01",
    "ISO14971-7.1-01",
]


def _load_json_override(env_key: str):
    raw = os.getenv(env_key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{env_key} must be valid JSON: {exc}") from exc


# Static config values intended for direct import by the batch runner.
EVAL_DOCS: List[Dict[str, str]] = _load_json_override("EVAL_DOCS_JSON") or _DEFAULT_EVAL_DOCS
EVAL_REQUIREMENTS: List[str] = _load_json_override("EVAL_REQUIREMENTS_JSON") or _DEFAULT_EVAL_REQUIREMENTS
NUM_RUNS: int = int(os.getenv("EVAL_NUM_RUNS", "5"))
CONFIG_LABEL: str = os.getenv("EVAL_CONFIG_LABEL", "baseline_v1")
RUN_MODE: str = os.getenv("EVAL_RUN_MODE", "precision").strip().lower()
