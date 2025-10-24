#!/usr/bin/env python3
"""
Utilities for constructing canonical document artifacts and coverage windows.
"""

from __future__ import annotations

import json
import math
import re
import uuid
from bisect import bisect_right
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

WINDOW_WORD_LIMIT = 1800
WINDOW_WORD_OVERLAP = 400
MAX_WINDOW_TEXT_CHARS = 12000

HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*)$")
IMAGE_PATTERN = re.compile(r"!\[(?P<alt>.*?)\]\((?P<src>.*?)\)")


@dataclass
class HeadingRecord:
    heading_id: str
    text: str
    level: int
    page_number: int
    line_index: int
    global_word_index: int
    path: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class TableRecord:
    table_id: str
    page_number: int
    start_line: int
    end_line: int
    preview: str


@dataclass
class FigureRecord:
    figure_id: str
    page_number: int
    alt_text: Optional[str]
    source: Optional[str]


@dataclass
class PageSummary:
    page_number: int
    char_count: int
    word_count: int
    headings: List[Dict[str, Any]] = field(default_factory=list)
    tables: List[Dict[str, Any]] = field(default_factory=list)
    figures: List[Dict[str, Any]] = field(default_factory=list)


def _count_words(text: str) -> int:
    return len(text.split())


def _extract_tables(page_text: str, page_number: int) -> List[TableRecord]:
    lines = page_text.splitlines()
    tables: List[TableRecord] = []
    current_block: List[Tuple[int, str]] = []

    def flush_if_table() -> None:
        if not current_block:
            return
        block_lines = [line for _, line in current_block]
        separator_present = any("---" in line for line in block_lines)
        if separator_present and len(block_lines) >= 2:
            start_index = current_block[0][0]
            end_index = current_block[-1][0]
            preview = "\n".join(block_lines[:4])
            tables.append(
                TableRecord(
                    table_id=f"tbl-{uuid.uuid4().hex[:8]}",
                    page_number=page_number,
                    start_line=start_index,
                    end_line=end_index,
                    preview=preview,
                )
            )
        current_block.clear()

    for index, line in enumerate(lines):
        contains_table = "|" in line
        if contains_table:
            current_block.append((index, line))
        else:
            flush_if_table()
    flush_if_table()
    return tables


def _extract_figures(page_text: str, page_number: int) -> List[FigureRecord]:
    figures: List[FigureRecord] = []
    for match in IMAGE_PATTERN.finditer(page_text):
        alt_text = match.group("alt").strip() or None
        source = match.group("src").strip() or None
        figures.append(
            FigureRecord(
                figure_id=f"fig-{uuid.uuid4().hex[:8]}",
                page_number=page_number,
                alt_text=alt_text,
                source=source,
            )
        )
    return figures


def _build_heading_timeline(
    pages: Sequence[str],
) -> Tuple[List[HeadingRecord], List[PageSummary]]:
    headings: List[HeadingRecord] = []
    summaries: List[PageSummary] = []
    heading_stack: List[HeadingRecord] = []
    global_word_index = 0

    for page_number, page_text in enumerate(pages, start=1):
        headings_for_page: List[Dict[str, Any]] = []
        page_tables = _extract_tables(page_text, page_number)
        page_figures = _extract_figures(page_text, page_number)
        lines = page_text.splitlines()

        for line_index, raw_line in enumerate(lines):
            line = raw_line.strip()
            match = HEADING_PATTERN.match(line)
            if match:
                level = len(match.group(1))
                text = match.group(2).strip()
                while heading_stack and heading_stack[-1].level >= level:
                    heading_stack.pop()
                record = HeadingRecord(
                    heading_id=f"sec-{uuid.uuid4().hex[:10]}",
                    text=text,
                    level=level,
                    page_number=page_number,
                    line_index=line_index,
                    global_word_index=global_word_index,
                )
                heading_stack.append(record)
                record.path = [
                    {
                        "heading_id": item.heading_id,
                        "text": item.text,
                        "level": item.level,
                    }
                    for item in heading_stack
                ]
                headings.append(record)
                headings_for_page.append(
                    {
                        "heading_id": record.heading_id,
                        "text": record.text,
                        "level": record.level,
                        "line_index": record.line_index,
                    }
                )
            global_word_index += _count_words(raw_line)

        summaries.append(
            PageSummary(
                page_number=page_number,
                char_count=len(page_text),
                word_count=_count_words(page_text),
                headings=headings_for_page,
                tables=[asdict(table) for table in page_tables],
                figures=[asdict(figure) for figure in page_figures],
            )
        )

    return headings, summaries


def _tokenize_with_pages(pages: Sequence[str]) -> Tuple[List[str], List[int]]:
    tokens: List[str] = []
    token_pages: List[int] = []
    for page_number, page_text in enumerate(pages, start=1):
        for token in page_text.split():
            tokens.append(token)
            token_pages.append(page_number)
    return tokens, token_pages


def _truncate_excerpt(text: str) -> str:
    if len(text) <= MAX_WINDOW_TEXT_CHARS:
        return text
    return text[: MAX_WINDOW_TEXT_CHARS - 3] + "..."


def _resolve_heading_path(
    headings: Sequence[HeadingRecord],
    word_indices: List[int],
    start_word_index: int,
) -> List[Dict[str, Any]]:
    if not headings:
        return []
    position = bisect_right(word_indices, start_word_index) - 1
    if position < 0:
        return []
    return headings[position].path


def build_canonical_document_artifact(
    pages: Sequence[str],
    *,
    filename: Optional[str] = None,
    extraction_metadata: Optional[Dict[str, Any]] = None,
    window_word_limit: int = WINDOW_WORD_LIMIT,
    window_word_overlap: int = WINDOW_WORD_OVERLAP,
) -> Dict[str, Any]:
    """
    Build a canonical document artifact with structural metadata and coverage windows.
    """
    page_list = list(pages or [])
    extraction_metadata = extraction_metadata or {}

    window_word_limit = max(int(window_word_limit or WINDOW_WORD_LIMIT), 1)
    window_word_overlap = max(0, min(int(window_word_overlap or WINDOW_WORD_OVERLAP), window_word_limit - 1))

    headings, summaries = _build_heading_timeline(page_list)
    heading_word_indices = [item.global_word_index for item in headings]

    tokens, token_pages = _tokenize_with_pages(page_list)
    total_words = len(tokens)
    total_chars = sum(len(page) for page in page_list)

    stride = max(window_word_limit - window_word_overlap, 1)
    coverage_windows: List[Dict[str, Any]] = []

    if tokens:
        for start in range(0, total_words, stride):
            end = min(start + window_word_limit, total_words)
            window_tokens = tokens[start:end]
            if not window_tokens:
                continue
            start_page = token_pages[start]
            end_page = token_pages[end - 1]
            heading_path = _resolve_heading_path(headings, heading_word_indices, start)
            window_text = " ".join(window_tokens)
            coverage_windows.append(
                {
                    "window_id": f"win-{uuid.uuid4().hex[:12]}",
                    "start_word_index": start,
                    "end_word_index": end - 1,
                    "word_count": len(window_tokens),
                    "start_page": start_page,
                    "end_page": end_page,
                    "heading_path": heading_path,
                    "text": _truncate_excerpt(window_text),
                }
            )
            if end == total_words:
                break

    artifact = {
        "artifact_id": f"doc-{uuid.uuid4().hex[:12]}",
        "filename": filename,
        "page_count": len(page_list),
        "word_count": total_words,
        "char_count": total_chars,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": [
            {
                "heading_id": heading.heading_id,
                "text": heading.text,
                "level": heading.level,
                "page_number": heading.page_number,
                "line_index": heading.line_index,
                "global_word_index": heading.global_word_index,
            }
            for heading in headings
        ],
        "pages": [asdict(summary) for summary in summaries],
        "coverage_windows": coverage_windows,
        "extraction_metadata": extraction_metadata,
    }
    return artifact


def canonical_artifact_to_json(artifact: Dict[str, Any], *, indent: Optional[int] = None) -> str:
    return json.dumps(artifact, indent=indent, ensure_ascii=True)
