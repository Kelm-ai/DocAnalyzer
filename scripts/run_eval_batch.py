#!/usr/bin/env python3
"""
Batch runner for repeatability testing.

Iterates over a hardcoded eval set (see eval_config.py), runs the evaluator
for each (doc, requirement, run_index), and logs results into the eval_results
table.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import tempfile
import urllib.request

from dotenv import load_dotenv

# Load environment variables from project root first
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv()  # local overrides if present

# Ensure we can import local modules
for extra_path in (ROOT_DIR, ROOT_DIR / "api", ROOT_DIR / "test_evaluation"):
    str_path = str(extra_path)
    if str_path not in sys.path:
        sys.path.append(str_path)

from eval_config import CONFIG_LABEL, EVAL_DOCS, EVAL_REQUIREMENTS, NUM_RUNS, RUN_MODE  # noqa: E402

try:
    from api.vision_responses_evaluator import VisionResponsesEvaluator  # type: ignore  # noqa: E402
except Exception:  # pragma: no cover - fallback to test_evaluation variant if API import fails
    from vision_responses_evaluator import VisionResponsesEvaluator  # type: ignore  # noqa: E402

try:
    from supabase import Client, create_client  # type: ignore  # noqa: E402
except ImportError as exc:  # pragma: no cover - supabase is required for inserts
    raise SystemExit(f"Supabase client missing. Install requirements.txt packages. Original error: {exc}") from exc


logger = logging.getLogger("run_eval_batch")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


def _resolve_batch_id(cli_value: Optional[str]) -> str:
    if cli_value:
        return cli_value
    return f"manual_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"


def _build_supabase_client() -> Client:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required")
    return create_client(supabase_url, supabase_key)


def _load_requirements_from_supabase(supabase: Client, requirement_ids: List[str]) -> Dict[str, Dict]:
    response = supabase.table("iso_requirements").select("*").in_("id", requirement_ids).execute()
    data = getattr(response, "data", None) or []
    return {row["id"]: row for row in data if "id" in row}


def _load_requirements_fallback(requirement_ids: List[str]) -> Dict[str, Dict]:
    # Fallback to local requirements fixtures
    fallback_paths = [
        ROOT_DIR / "test_evaluation" / "requirements_full.json",
        ROOT_DIR / "test_evaluation" / "requirements_test.json",
    ]
    for path in fallback_paths:
        if path.exists():
            try:
                payload = json.loads(path.read_text())
                return {row["id"]: row for row in payload if row.get("id") in requirement_ids}
            except Exception as exc:
                logger.warning("Failed to load requirements from %s (%s)", path, exc)
    raise RuntimeError("Unable to load requirements from Supabase or local fixtures")


def _normalize_model_label(status: Optional[str]) -> str:
    if not status:
        return "FLAG"
    normalized = status.strip().upper()
    if normalized in {"PASS", "FAIL"}:
        return normalized
    if normalized in {"FLAG", "FLAGGED", "PARTIAL", "NOT_APPLICABLE"}:
        return "FLAG"
    return "FLAG"


async def _insert_eval_result(supabase: Client, row: Dict[str, Any]) -> None:
    def _insert():
        supabase.table("eval_results").insert(row).execute()

    await asyncio.to_thread(_insert)


async def _evaluate_single_run(
    evaluator: VisionResponsesEvaluator,
    file_ref: Dict[str, Any],
    requirement: Dict[str, Any],
    run_index: int,
    output_dir: Path,
) -> Tuple[str, Dict[str, Any]]:
    """Call the evaluator for a single requirement/run_index and return (model_label, raw_output)."""
    semaphore = asyncio.Semaphore(1)
    try:
        result = await evaluator._evaluate_single_requirement(  # pylint: disable=protected-access
            file_ref=file_ref,
            requirement=requirement,
            semaphore=semaphore,
            run_responses_dir=output_dir,
        )
    except Exception as exc:  # pragma: no cover - model call failures
        logger.exception("Evaluation failed for requirement %s run %s", requirement.get("id"), run_index)
        result = {
            "status": "ERROR",
            "rationale": str(exc),
            "tokens_used": 0,
        }

    model_label = _normalize_model_label(result.get("status"))
    raw_output = {
        "run_index": run_index,
        "requirement": requirement,
        "result": result,
        "run_mode": RUN_MODE,
    }
    return model_label, raw_output


def _materialize_document_path(doc_entry: Dict[str, str]) -> Tuple[Path, bool]:
    """
    Ensure the document path exists locally.
    Returns (path, should_cleanup) where should_cleanup indicates a temporary download.
    """
    raw_path = doc_entry["path"]
    path_obj = Path(raw_path)
    if path_obj.exists():
        return path_obj, False

    if raw_path.startswith(("http://", "https://")):
        suffix = Path(raw_path).suffix or ".pdf"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            logger.info("Downloading document %s to %s", raw_path, tmp.name)
            with urllib.request.urlopen(raw_path) as response:
                tmp.write(response.read())
        return Path(tmp.name), True

    raise FileNotFoundError(f"Document path does not exist: {raw_path}")


async def run_batch(batch_id: str, config_label: str) -> None:
    supabase = _build_supabase_client()
    logger.info("Starting batch %s (config_label=%s)", batch_id, config_label)

    # Load requirements (Supabase preferred; fallback to local fixtures)
    requirements_map = {}
    try:
        requirements_map = _load_requirements_from_supabase(supabase, EVAL_REQUIREMENTS)
    except Exception as exc:
        logger.warning("Failed to load requirements from Supabase (%s), falling back to local fixtures", exc)

    if len(requirements_map) < len(EVAL_REQUIREMENTS):
        logger.warning(
            "Falling back to local requirements for missing IDs (Supabase returned %s of %s)",
            len(requirements_map),
            len(EVAL_REQUIREMENTS),
        )
        try:
            local_map = _load_requirements_fallback(EVAL_REQUIREMENTS)
            requirements_map.update(local_map)
        except Exception as exc:
            logger.error("Failed to load requirements fallback: %s", exc)
            raise

    evaluator = VisionResponsesEvaluator()

    for doc in EVAL_DOCS:
        doc_id = doc["id"]
        path_obj, should_cleanup = _materialize_document_path(doc)

        file_ref, file_hash, cache_hit = await evaluator.ensure_file_ref(path_obj)
        logger.info(
            "Prepared doc_id=%s path=%s file_ref=%s cache_hit=%s sha256=%s",
            doc_id,
            path_obj,
            file_ref,
            cache_hit,
            file_hash[:12],
        )

        run_responses_dir = evaluator.responses_dir / f"batch_{batch_id}_{doc_id}"
        run_responses_dir.mkdir(parents=True, exist_ok=True)

        for requirement_id in EVAL_REQUIREMENTS:
            requirement = requirements_map.get(requirement_id)
            if not requirement:
                logger.error("Requirement %s not found; skipping", requirement_id)
                continue

            for run_index in range(NUM_RUNS):
                logger.info(
                    "Running doc=%s requirement=%s run_index=%s",
                    doc_id,
                    requirement_id,
                    run_index,
                )
                model_label, raw_output = await _evaluate_single_run(
                    evaluator=evaluator,
                    file_ref=file_ref,
                    requirement=requirement,
                    run_index=run_index,
                    output_dir=run_responses_dir,
                )

                row = {
                    "batch_id": batch_id,
                    "config_label": config_label,
                    "doc_id": doc_id,
                    "requirement_id": requirement_id,
                    "run_index": run_index,
                    "model_label": model_label,
                    "raw_output": raw_output,
                }
                await _insert_eval_result(supabase, row)

        if should_cleanup:
            try:
                path_obj.unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("Failed to clean up temp file %s: %s", path_obj, exc)

    logger.info("Completed batch %s", batch_id)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repeated evaluations and log to eval_results.")
    parser.add_argument("batch_id", nargs="?", help="Batch identifier (default: manual_<timestamp>)")
    parser.add_argument(
        "--config-label",
        dest="config_label",
        help=f"Override config label (default from eval_config.py: {CONFIG_LABEL})",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    batch_id = _resolve_batch_id(args.batch_id)
    config_label = args.config_label or CONFIG_LABEL
    try:
        asyncio.run(run_batch(batch_id, config_label))
    except KeyboardInterrupt:
        logger.warning("Batch interrupted by user")
