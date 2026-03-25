#!/usr/bin/env python3
"""
Backfill requirement presentations for an existing evaluation.

Reconstructs the summary object from Supabase, re-runs the presentation
generator, and patches compliance_reports.requirement_presentations.

Usage:
    python scripts/backfill_presentations.py <evaluation_id>
    python scripts/backfill_presentations.py 2b979eae-75a8-4671-958c-a177a71cdc76

The script will:
  1. Load requirement evaluations from Supabase
  2. Run the presentation generator (which handles OpenAI file upload/caching)
  3. Patch the compliance_reports row with the new presentations
  4. Print a summary of how many requirements got real vs fallback content
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Bootstrap: load .env and set up path so api/ imports work
# ---------------------------------------------------------------------------

_repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_repo_root))
sys.path.insert(0, str(_repo_root / "api"))

try:
    from dotenv import load_dotenv
    load_dotenv(_repo_root / ".env")
except ImportError:
    pass  # dotenv optional; rely on env vars being set already

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("backfill_presentations")

# ---------------------------------------------------------------------------
# Imports (after path setup)
# ---------------------------------------------------------------------------

from supabase import create_client

try:
    from api.requirement_presentation_generator import generate_requirement_presentations_sync
except ImportError:
    from requirement_presentation_generator import generate_requirement_presentations_sync  # type: ignore


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_summary(evaluation_id: str, supabase) -> dict:
    """Reconstruct the summary dict the generator expects from Supabase data."""

    # Evaluation record
    eval_row = (
        supabase.table("document_evaluations")
        .select("id, document_name, status")
        .eq("id", evaluation_id)
        .single()
        .execute()
    ).data
    if not eval_row:
        raise ValueError(f"Evaluation {evaluation_id} not found")

    document_name = eval_row.get("document_name", "Unknown Document")
    logger.info("Evaluation: %s  (%s)", document_name, eval_row.get("status"))

    # Requirement evaluations
    req_rows = (
        supabase.table("requirement_evaluations")
        .select("*, iso_requirements(title, clause)")
        .eq("document_evaluation_id", evaluation_id)
        .execute()
    ).data or []

    logger.info("Found %d requirement evaluations", len(req_rows))

    requirements_results = []
    for row in req_rows:
        iso_req = row.get("iso_requirements") or {}
        requirements_results.append({
            "requirement_id": row.get("requirement_id"),
            "requirement_clause": iso_req.get("clause") or row.get("requirement_clause"),
            "requirement_title": iso_req.get("title") or row.get("title", ""),
            "status": row.get("status", "ERROR"),
            "confidence": row.get("confidence_level", "low"),
            "confidence_level": row.get("confidence_level", "low"),
            "rationale": row.get("evaluation_rationale", ""),
            "evaluation_rationale": row.get("evaluation_rationale", ""),
            "evidence": row.get("evidence_snippets") or [],
            "evidence_snippets": row.get("evidence_snippets") or [],
            "gaps": row.get("gaps_identified") or [],
            "gaps_identified": row.get("gaps_identified") or [],
        })

    return {
        "document_info": {
            "file_name": document_name,
            "file_path": None,  # generator will use openai_file_id cache or storage download
        },
        "requirements_results": requirements_results,
    }


def _ensure_document_file(evaluation_id: str, supabase) -> str | None:
    """
    Download the primary document from Supabase Storage to a temp file.
    Returns the temp file path, or None if the document can't be located.
    The generator caches the OpenAI file_id back to evaluation_documents,
    so subsequent runs won't need to re-download.
    """
    doc_rows = (
        supabase.table("evaluation_documents")
        .select("id, file_name, storage_path, openai_file_id")
        .eq("evaluation_id", evaluation_id)
        .eq("document_role", "primary")
        .limit(1)
        .execute()
    ).data or []

    if not doc_rows:
        logger.warning(
            "No evaluation_documents row found for %s. "
            "The generator will skip the OpenAI call and use fallback content.",
            evaluation_id,
        )
        return None

    row = doc_rows[0]

    if row.get("openai_file_id"):
        logger.info("openai_file_id already cached: %s — no download needed", row["openai_file_id"])
        return None  # generator will use it directly

    storage_path = row.get("storage_path")
    if not storage_path:
        logger.warning("evaluation_documents row exists but storage_path is empty for %s", evaluation_id)
        return None

    # Strip the leading "documents/" prefix that Supabase Storage paths use
    bucket_key = storage_path.removeprefix("documents/")
    file_name = row.get("file_name", "document.pdf")
    suffix = Path(file_name).suffix or ".pdf"

    logger.info("Downloading %s from Supabase Storage...", storage_path)
    try:
        data = supabase.storage.from_("documents").download(bucket_key)
    except Exception as exc:
        logger.error("Storage download failed: %s", exc)
        return None

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(data)
    tmp.flush()
    tmp.close()
    logger.info("Downloaded to temp file: %s", tmp.name)
    return tmp.name


def _patch_report(evaluation_id: str, presentations: dict, supabase) -> None:
    """Patch the compliance_reports row with new presentations."""
    report_row = (
        supabase.table("compliance_reports")
        .select("id")
        .eq("document_evaluation_id", evaluation_id)
        .single()
        .execute()
    ).data

    if not report_row:
        logger.error("No compliance_reports row for %s — cannot patch", evaluation_id)
        return

    supabase.table("compliance_reports").update(
        {"requirement_presentations": presentations}
    ).eq("document_evaluation_id", evaluation_id).execute()

    logger.info("Patched compliance_reports for %s", evaluation_id)


def _count_citations(presentations: dict) -> int:
    total = 0
    for pres in presentations.values():
        for claim in pres.get("inline_claims", []):
            total += len(claim.get("citations", []))
        for claim in pres.get("modal_claims", []):
            total += len(claim.get("citations", []))
        for block in pres.get("full_analysis", []):
            total += len(block.get("citations", []))
    return total


def _count_fallbacks(presentations: dict) -> int:
    return sum(
        1 for p in presentations.values()
        if p.get("presentation_version", "").startswith("default-fallback")
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/backfill_presentations.py <evaluation_id>")
        sys.exit(1)

    evaluation_id = sys.argv[1].strip()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    # Build summary
    try:
        summary = _build_summary(evaluation_id, supabase)
    except ValueError as exc:
        logger.error("%s", exc)
        sys.exit(1)

    # Ensure the document is accessible (download from Storage if needed)
    temp_path = _ensure_document_file(evaluation_id, supabase)
    if temp_path:
        summary["document_info"]["file_path"] = temp_path

    # Generate presentations
    logger.info("Running presentation generator...")
    try:
        presentations = generate_requirement_presentations_sync(
            evaluation_id=evaluation_id,
            summary=summary,
            supabase_client=supabase,
        )
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass

    if not presentations:
        logger.error(
            "Generator returned no presentations. "
            "Check that OPENAI_API_KEY is set and that the document is accessible in evaluation_documents."
        )
        sys.exit(1)

    # Patch the report
    _patch_report(evaluation_id, presentations, supabase)

    # Summary
    total = len(presentations)
    citations = _count_citations(presentations)
    fallbacks = _count_fallbacks(presentations)
    real = total - fallbacks

    print()
    print("=" * 50)
    print(f"  evaluation_id       : {evaluation_id}")
    print(f"  requirement_presentations : {total}")
    print(f"  real generated      : {real}")
    print(f"  fallback            : {fallbacks}")
    print(f"  inline_citations    : {citations}")
    print("=" * 50)

    if citations == 0:
        print("\nWARNING: No citations were generated.")
        print("Check the logs above for API errors from the generator.")


if __name__ == "__main__":
    main()
