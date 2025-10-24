#!/usr/bin/env python3
"""
Helper script to upload the Altimmune PDF to the document-intelligence/markdown endpoint.
Displays key stats (page count, coverage window count, Supabase record ID) and optionally
dumps the full JSON response.

Usage:
    python temp_scripts/run_canonical_upload.py
    python temp_scripts/run_canonical_upload.py --output-json response.json
    python temp_scripts/run_canonical_upload.py --no-store
    python temp_scripts/run_canonical_upload.py --url https://your-host.com
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

import requests

DEFAULT_ENDPOINT = "http://localhost:8000/api/document-intelligence/markdown"
DOCUMENT_PATH = Path("/Users/matthewparson/Desktop/SC/Risk Management/Example Altimmune Risk Management Procedure v2 11-30-2022.pdf")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send a document to the canonical artifact endpoint.")
    parser.add_argument("--url", default=DEFAULT_ENDPOINT, help="Endpoint URL to call.")
    parser.add_argument(
        "--no-store",
        dest="store_in_supabase",
        action="store_false",
        help="Do not set store_in_supabase=true on the request (default: send true).",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        help="Optional path to write the JSON response.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not DOCUMENT_PATH.exists():
        print(f"❌ Error: document not found at {DOCUMENT_PATH}", file=sys.stderr)
        return 1

    # Display upload info
    print(f"📄 Uploading: {DOCUMENT_PATH.name}")
    print(f"🎯 Target URL: {args.url}")
    if not args.store_in_supabase:
        print("⚠️  Supabase storage: DISABLED")
    print()

    params = {
        "output_format": "markdown",
        "sanitize": "true",
        "convert_tables": "true",
        "strip_comments": "true",
        "store_in_supabase": "true" if args.store_in_supabase else "false",
    }

    try:
        with DOCUMENT_PATH.open("rb") as handle:
            files = {"file": (DOCUMENT_PATH.name, handle, "application/pdf")}
            response = requests.post(args.url, params=params, files=files, timeout=120)

        response.raise_for_status()
        payload: Dict[str, Any] = response.json()

    except requests.HTTPError as exc:
        print(f"❌ Upload failed: {exc}", file=sys.stderr)
        print(f"Response body: {response.text}", file=sys.stderr)
        return 1
    except requests.RequestException as exc:
        print(f"❌ Request error: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"❌ Failed to parse JSON response: {exc}", file=sys.stderr)
        print(f"Raw response: {response.text}", file=sys.stderr)
        return 1

    # Extract key statistics
    print("✅ Upload successful!\n")
    print("📊 Key Statistics:")
    print("─" * 60)

    # Supabase record ID
    supabase_id = payload.get("supabase_id") or payload.get("canonical_document_id") or payload.get("id")
    if supabase_id:
        print(f"  Supabase Record ID: {supabase_id}")
    else:
        print("  Supabase Record ID: (not stored)")

    # Page count
    page_count = payload.get("page_count", "N/A")
    print(f"  Page Count: {page_count}")

    # Coverage windows
    coverage = payload.get("coverage_manifest") or payload.get("coverage_windows") or []
    window_count = len(coverage) if isinstance(coverage, list) else "N/A"
    print(f"  Coverage Window Count: {window_count}")

    # Canonical artifact info
    canonical = payload.get("canonical_artifact") or {}
    if canonical:
        artifact_id = canonical.get("artifact_id")
        if artifact_id:
            print(f"  Artifact ID: {artifact_id}")

    # Content size
    content = canonical.get("markdown_content") or payload.get("markdown_content", "")
    if content:
        content_size = len(content)
        print(f"  Markdown Content Size: {content_size:,} chars")

    # Tables extracted
    tables = canonical.get("tables") or payload.get("tables") or []
    if isinstance(tables, list):
        print(f"  Tables Extracted: {len(tables)}")

    print("─" * 60)

    # Show coverage window summary
    if isinstance(coverage, list) and coverage:
        print(f"\n📍 Coverage Windows ({len(coverage)}):")
        for i, window in enumerate(coverage[:5], 1):  # Show first 5
            pages = window.get("pages") or window.get("page_range", "?")
            heading = window.get("heading") or window.get("title", "(no heading)")
            heading_preview = heading[:50] + "..." if len(heading) > 50 else heading
            print(f"  {i}. Pages {pages}: {heading_preview}")

        if len(coverage) > 5:
            print(f"  ... and {len(coverage) - 5} more")

    # Optional: dump full JSON
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(payload, indent=2))
        print(f"\n💾 Full JSON saved to: {args.output_json}")

    print("\n✨ Done!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
