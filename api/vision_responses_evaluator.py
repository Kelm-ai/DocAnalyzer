#!/usr/bin/env python3
"""
ISO 14971 Vision Responses Evaluator

Uploads a PDF to the selected provider's Files API (OpenAI or Gemini) once,
reuses the returned handle across parallel calls, and evaluates the ISO test
requirements. This mirrors ChatGPT's "look at the document" behaviour while
keeping output structure comparable with the markdown-based evaluator.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

from evaluation_schema import RequirementEvaluationSchema

import openai
from openai import OpenAI

try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None  # type: ignore
    genai_types = None  # type: ignore
    print("Warning: google-genai not available. Gemini provider will be disabled.")

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("Warning: Supabase not available. Will use local requirements file.")

logger = logging.getLogger(__name__)


class VisionResponsesEvaluator:
    """Evaluate ISO requirements using gpt-5-mini with attached PDF file."""

    BASE_INSTRUCTION = """
You are an expert medical device risk-management assessor with deep knowledge of ISO 14971:2019 and ISO/TR 24971. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from ISO 14971:2019 clauses 4-10.

Context and assumptions:
- Treat the document as a top-level risk-management artifact (procedure, RMP, RMR, etc.). It may reference other SOPs, work instructions, or records; clear cross-references are acceptable evidence that such systems/records exist.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. Do not score clauses 1-3 or annexes as standalone requirements.

How to review each clause invocation:
1) Understand what type of document this is and how it fits the risk-management system.
2) Focus ONLY on the requested clause; search the entire document (headings, lists, tables, appendices, images/OCR) for relevant evidence of the process and expected records.
3) Presence vs adequacy: assess basic alignment with the clause. Minor ambiguity or “could be better” solutions can still PASS; treat those as opportunities for improvement (OFIs).
4) Cross-references: if the document points to another controlled SOP or record, consider that evidence that the process/record exists; do not invent details that are not written.

Decision logic (map to our schema):
- PASS: Requirement is clearly addressed; process/structure is described and evidence/records are indicated (directly or via cross-reference). Capture OFIs separately.
- FLAGGED (flag_for_review): Evidence exists but is incomplete/ambiguous or needs human confirmation; or statements conflict. Use for genuine uncertainty.
- FAIL: Core expectations are missing/contradicted; required process/records are not defined and no reasonable indication they exist.
- NOT_APPLICABLE: Use only if the clause truly does not apply to the document provided.
When in doubt between PASS and FLAGGED, prefer PASS and note OFIs; use FLAGGED only when a human needs to review.

Vision handling:
- Use both text and visual content. When graphs appear, read axis titles/units and summarise trends. When tables appear, read cells and preserve structure. If text appears in an image, transcribe it before reasoning. If something is unreadable, write "[unreadable]" and move on.
""".strip()

    def __init__(
        self,
        *,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> None:
        self.provider = (provider or os.getenv("VISION_PROVIDER") or "openai").strip().lower()
        if self.provider not in {"openai", "gemini"}:
            raise RuntimeError(f"Unsupported VISION_PROVIDER '{self.provider}'. Use 'openai' or 'gemini'.")

        self.model = model
        self.openai_client: Optional[OpenAI] = None
        self.gemini_client: Optional["genai.Client"] = None
        self.gemini_response_schema = None

        if self.provider == "gemini":
            if not GENAI_AVAILABLE:
                raise RuntimeError("google-genai is required for Gemini (pip install google-genai)")
            api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY is required when VISION_PROVIDER=gemini")
            self.model = self.model or os.getenv("GEMINI_VISION_MODEL", os.getenv("GEMINI_MODEL", "gemini-2.0-flash"))
            self.gemini_client = genai.Client(api_key=api_key)
            self.gemini_response_schema = self._build_gemini_schema()
        else:
            api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is required for the vision evaluator")
            self.model = self.model or os.getenv("OPENAI_VISION_MODEL", os.getenv("OPENAI_MODEL", "gpt-5"))
            self.openai_client = OpenAI(api_key=api_key)

        self.concurrent_requests = int(os.getenv("VISION_EVALUATOR_CONCURRENCY", "8"))
        self.reasoning_effort = os.getenv('VISION_REASONING_EFFORT', 'medium')
        self.requirements_limit = int(os.getenv("VISION_EVALUATOR_REQUIREMENT_LIMIT", "0"))

        self.supabase: Optional[Client] = None
        if SUPABASE_AVAILABLE:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if supabase_url and supabase_key:
                try:
                    self.supabase = create_client(supabase_url, supabase_key)
                except Exception as exc:
                    print(f"Warning: Failed to initialize Supabase client ({exc}). Falling back to local requirements.")

        base_dir = Path(__file__).parent
        self.requirements_path = base_dir / "requirements_test.json"
        self.output_dir = base_dir / "output" / "vision_results"
        self.responses_dir = self.output_dir / "responses"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.responses_dir.mkdir(parents=True, exist_ok=True)

        self.cache_path = self.output_dir / f"uploaded_files_cache_{self.provider}.json"
        self.file_cache = self._load_cache()

        if self.provider == "openai":
            logger.info(
                "VisionResponsesEvaluator initialised (provider=%s) with openai %s (%s); client=%s; model=%s; limit=%s; concurrency=%s",
                self.provider,
                getattr(openai, "__version__", "unknown"),
                getattr(openai, "__file__", "unknown"),
                type(self.openai_client).__name__ if self.openai_client else "missing",
                self.model,
                self.requirements_limit,
                self.concurrent_requests,
            )
        else:
            logger.info(
                "VisionResponsesEvaluator initialised (provider=%s); client=%s; model=%s; limit=%s; concurrency=%s",
                self.provider,
                type(self.gemini_client).__name__ if self.gemini_client else "missing",
                self.model,
                self.requirements_limit,
                self.concurrent_requests,
            )


    async def evaluate_document(self, file_path: str) -> Dict:
        document_path = Path(file_path)
        if not document_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        if document_path.suffix.lower() != ".pdf":
            raise ValueError("Vision evaluator currently supports PDF files only")

        file_ref, file_hash, cache_hit = await self.ensure_file_ref(document_path)

        raw_requirements = self._load_requirements()
        requirements: List[Dict] = []
        for req in raw_requirements:
            req_id = str(req.get("id") or "").strip()
            title = str(req.get("title") or req.get("requirement_text") or "").strip()
            if not req_id or not title:
                logger.warning("Skipping malformed requirement row: %s", req)
                continue
            display_value = req.get("display_order")
            try:
                display_value = int(display_value)
            except (TypeError, ValueError):
                display_value = None
            fallback_order = req.get("sort_order")  # backward compatibility if present
            try:
                fallback_order = int(fallback_order)
            except (TypeError, ValueError):
                fallback_order = None
            resolved_order = display_value if display_value is not None else fallback_order if fallback_order is not None else 0
            requirements.append({
                "id": req_id,
                "clause": str(req.get("clause") or "").strip(),
                "title": title,
                "display_order": resolved_order,
                "evaluation_type": req.get("evaluation_type"),
                # Keep requirement_text for backward compatibility/context if present
                "requirement_text": req.get("requirement_text"),
            })

        requirements.sort(key=lambda r: (r.get("display_order") or 0, r.get("clause", ""), r.get("title", "")))

        if not requirements:
            raise RuntimeError("No requirements available for evaluation")

        run_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        run_responses_dir = self.responses_dir / run_id
        run_responses_dir.mkdir(parents=True, exist_ok=True)

        document_stats = {
            "file_name": document_path.name,
            "file_path": str(document_path.resolve()),
            "file_size_bytes": document_path.stat().st_size,
            "uploaded_file_id": file_ref.get("file_id"),
            "uploaded_file_uri": file_ref.get("file_uri"),
            "content_hash": file_hash,
            "file_id_cache_hit": cache_hit,
            "model": self.model,
            "provider": self.provider,
            "evaluated_at": datetime.utcnow().isoformat(),
            "run_id": run_id,
        }

        semaphore = asyncio.Semaphore(self.concurrent_requests)
        tasks = [
            self._evaluate_single_requirement(file_ref, requirement, semaphore, run_responses_dir)
            for requirement in requirements
        ]

        evaluations = await asyncio.gather(*tasks, return_exceptions=True)

        results: List[Dict] = []
        for requirement, evaluation in zip(requirements, evaluations):
            if isinstance(evaluation, Exception):
                results.append({
                    "requirement_id": requirement["id"],
                    "status": "ERROR",
                    "confidence": "low",  # Categorical string confidence
                    "rationale": str(evaluation),
                    "evidence": [],
                    "gaps": ["Evaluation failed"],
                    "recommendations": ["Retry requirement"],
                    "tokens_used": 0,
                })
            else:
                results.append(evaluation)

        summary = self._generate_summary(document_stats, results)
        self._persist_summary(summary, run_id)
        return summary

    async def ensure_file_ref(self, document_path: Path) -> Tuple[Dict[str, str], str, bool]:
        """Upload the PDF once and cache the returned identifier per provider."""
        data = document_path.read_bytes()
        file_hash = hashlib.sha256(data).hexdigest()
        cached_entry = self.file_cache.get(file_hash)
        if cached_entry and cached_entry.get("provider") == self.provider:
            return cached_entry, file_hash, True

        if self.provider == "gemini":
            if self.gemini_client is None:
                raise RuntimeError("Gemini client is not configured")
            upload = await asyncio.to_thread(
                self.gemini_client.files.upload,
                file=document_path,
            )
            file_id = getattr(upload, "name", None) or getattr(upload, "uri", None)
            file_uri = getattr(upload, "uri", None) or file_id
            file_meta = {
                "provider": "gemini",
                "file_id": file_id,
                "file_uri": file_uri,
                "file_name": getattr(upload, "display_name", None) or document_path.name,
                "mime_type": getattr(upload, "mime_type", None) or "application/pdf",
                "uploaded_at": datetime.utcnow().isoformat(),
            }
            if not file_meta["file_uri"]:
                raise RuntimeError("Gemini upload failed: missing file URI")
        else:
            if self.openai_client is None:
                raise RuntimeError("OpenAI client is not configured")
            with open(document_path, "rb") as file_obj:
                upload = await asyncio.to_thread(
                    self.openai_client.files.create,
                    file=file_obj,
                    purpose="user_data",
                )

            file_meta = {
                "provider": "openai",
                "file_id": upload.id,
                "file_uri": getattr(upload, "id", None),
                "file_name": document_path.name,
                "uploaded_at": datetime.utcnow().isoformat(),
            }

        self.file_cache[file_hash] = file_meta
        self._save_cache()
        return file_meta, file_hash, False

    async def _evaluate_single_requirement(
        self,
        file_ref: Dict,
        requirement: Dict,
        semaphore: asyncio.Semaphore,
        run_responses_dir: Path,
    ) -> Dict:
        if self.provider == "gemini":
            return await self._evaluate_single_requirement_gemini(file_ref, requirement, semaphore, run_responses_dir)
        return await self._evaluate_single_requirement_openai(
            file_ref.get("file_id", ""),
            requirement,
            semaphore,
            run_responses_dir,
        )

    async def _evaluate_single_requirement_openai(
        self,
        file_id: str,
        requirement: Dict,
        semaphore: asyncio.Semaphore,
        run_responses_dir: Path,
    ) -> Dict:
        async with semaphore:
            prompt = self._build_prompt(requirement)

            try:
                response = await asyncio.to_thread(
                    self.openai_client.responses.parse,  # type: ignore[union-attr]
                    model=self.model,
                    reasoning={"effort": self.reasoning_effort},
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": prompt},
                                {"type": "input_file", "file_id": file_id},
                            ],
                        }
                    ],
                    text_format=RequirementEvaluationSchema,
                )
            except AttributeError as attr_err:
                logger.exception("Vision API attribute error for requirement %s", requirement['id'])
                return {
                    "requirement_id": requirement["id"],
                    "status": "ERROR",
                    "confidence": "low",  # Categorical string confidence
                    "rationale": str(attr_err),
                    "evidence": [],
                    "gaps": ["OpenAI client lacks responses API"],
                    "recommendations": ["Upgrade openai package"],
                    "tokens_used": 0,
                }

            usage = getattr(response, "usage", None)
            tokens_used = getattr(usage, "total_tokens", 0) if usage else 0

            parsed_model = getattr(response, "output_parsed", None)
            if parsed_model is None:
                return {
                    "requirement_id": requirement["id"],
                    "status": "ERROR",
                    "confidence": "low",  # Categorical string confidence
                    "rationale": "Structured output missing from model response",
                    "evidence": [],
                    "gaps": ["Model response missing structured payload"],
                    "recommendations": ["Retry evaluation"],
                    "tokens_used": tokens_used,
                }

            parsed = parsed_model.model_dump()
            parsed.setdefault("requirement_id", requirement["id"])
            parsed.setdefault("requirement_title", requirement.get("title"))
            parsed.setdefault("requirement_clause", requirement.get("clause"))
            parsed["tokens_used"] = tokens_used
            raw_file = run_responses_dir / f"response_{requirement['id'].replace('-', '_')}.txt"
            raw_text = getattr(response, "output_text", None) or json.dumps(parsed, indent=2)
            raw_file.write_text(raw_text, encoding="utf-8")
            return parsed

    async def _evaluate_single_requirement_gemini(
        self,
        file_ref: Dict,
        requirement: Dict,
        semaphore: asyncio.Semaphore,
        run_responses_dir: Path,
    ) -> Dict:
        async with semaphore:
            prompt = self._build_prompt(requirement)
            file_uri = file_ref.get("file_uri") or file_ref.get("file_id")
            mime_type = file_ref.get("mime_type") or "application/pdf"

            try:
                file_part = genai_types.Part(file_data=genai_types.FileData(file_uri=file_uri, mime_type=mime_type))  # type: ignore[arg-type]
                response = await asyncio.to_thread(
                    self.gemini_client.models.generate_content,  # type: ignore[union-attr]
                    model=self.model,
                    contents=[file_part, prompt],
                    config=genai_types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=self.gemini_response_schema,
                    ),
                )
            except Exception as exc:
                logger.exception("Gemini API error for requirement %s", requirement['id'])
                return {
                    "requirement_id": requirement["id"],
                    "status": "ERROR",
                    "confidence": "low",
                    "rationale": str(exc),
                    "evidence": [],
                    "gaps": ["Gemini generate_content failed"],
                    "recommendations": ["Retry requirement"],
                    "tokens_used": 0,
                }

            usage = getattr(response, "usage_metadata", None)
            tokens_used = getattr(usage, "total_token_count", 0) if usage else 0

            parsed_model = getattr(response, "parsed", None)
            parsed: Optional[Dict] = None
            if parsed_model is not None:
                parsed = parsed_model if isinstance(parsed_model, dict) else parsed_model.model_dump()
            else:
                response_text = getattr(response, "text", None)
                if response_text:
                    try:
                        parsed = json.loads(response_text)
                    except json.JSONDecodeError:
                        parsed = None

            if parsed is None:
                raw_file = run_responses_dir / f"response_{requirement['id'].replace('-', '_')}.txt"
                raw_file.write_text(getattr(response, "text", "") or "", encoding="utf-8")
                return {
                    "requirement_id": requirement["id"],
                    "status": "ERROR",
                    "confidence": "low",
                    "rationale": "Structured output missing from Gemini response",
                    "evidence": [],
                    "gaps": ["Model response missing structured payload"],
                    "recommendations": ["Retry evaluation"],
                    "tokens_used": tokens_used,
                }

            parsed.setdefault("requirement_id", requirement["id"])
            parsed.setdefault("requirement_title", requirement.get("title"))
            parsed.setdefault("requirement_clause", requirement.get("clause"))
            parsed["tokens_used"] = tokens_used

            raw_file = run_responses_dir / f"response_{requirement['id'].replace('-', '_')}.txt"
            raw_text = getattr(response, "text", None) or json.dumps(parsed, indent=2)
            raw_file.write_text(raw_text, encoding="utf-8")
            return parsed

    def _build_prompt(self, requirement: Dict) -> str:
        description = requirement.get("title") or requirement.get("requirement_text") or ""
        requirement_details = "\n".join(
            [
                f"- ID: {requirement.get('id')}",
                f"- Clause: {requirement.get('clause', '')}",
                f"- Title: {description}",
                f"- Order: {requirement.get('display_order') if requirement.get('display_order') is not None else requirement.get('sort_order')}" if requirement.get("display_order") is not None or requirement.get("sort_order") is not None else "",
                f"- Evaluation Type: {requirement.get('evaluation_type')}" if requirement.get("evaluation_type") else "",
                f"- Additional Context: {requirement.get('requirement_text')}" if requirement.get("requirement_text") and requirement.get("requirement_text") != description else "",
            ]
        ).strip()

        instruction_block = (
            "MANDATORY METHOD:\n"
            "1. Review the attached PDF for visuals (tables, charts, signatures) whenever the text layer is insufficient.\n"
            "2. Evaluate ONLY the requested clause; cite page or section references for evidence. Treat clear cross-references to other SOPs/records as evidence that those processes/records exist.\n"
            "3. Decision logic: PASS if the requirement is clearly addressed and practicable (minor OFIs allowed); FAIL if the process/records are missing/contradicted; FLAGGED when evidence is incomplete or genuinely uncertain; NOT_APPLICABLE only when the clause truly does not apply.\n"
            "4. When in doubt between PASS and FLAGGED, choose PASS and note OFIs in the gaps/recommendations fields.\n"
            "5. Before finalising, confirm the chosen status best matches the evidence; do not default to FLAGGED when PASS or FAIL is supported.\n"
            "Respond strictly with JSON using this schema:\n"
            "{\n"
            "  \"status\": \"PASS|FAIL|FLAGGED|NOT_APPLICABLE\",\n"
            "  \"confidence\": \"low|medium|high\",\n"
            "  \"rationale\": \"Explain satisfied/unsatisfied criteria with citations\",\n"
            "  \"evidence\": [\"Page/Section citation with quote\", ...],\n"
            "  \"gaps\": [string],\n"
            "  \"recommendations\": [string]\n"
            "}\n"
            "Confidence level guidelines:\n"
            "- Use \"high\" when evidence is explicit, comprehensive, and directly addresses all criteria\n"
            "- Use \"medium\" when evidence is present but incomplete, requires some inference, or has minor gaps\n"
            "- Use \"low\" when evidence is sparse, ambiguous, uncertain, or requires significant assumptions\n"
        )

        prompt_sections = [
            self.BASE_INSTRUCTION,
            "".join(instruction_block),
            "Requirement:\n" + requirement_details,
        ]

        return "\n\n".join(prompt_sections)

    def _build_gemini_schema(self):
        if not GENAI_AVAILABLE or genai_types is None:
            return None
        return genai_types.Schema(
            type=genai_types.Type.OBJECT,
            properties={
                "status": genai_types.Schema(
                    type=genai_types.Type.STRING,
                    enum=["PASS", "FAIL", "FLAGGED", "NOT_APPLICABLE"],
                ),
                "confidence": genai_types.Schema(
                    type=genai_types.Type.STRING,
                    enum=["low", "medium", "high"],
                ),
                "rationale": genai_types.Schema(type=genai_types.Type.STRING),
                "evidence": genai_types.Schema(
                    type=genai_types.Type.ARRAY,
                    items=genai_types.Schema(type=genai_types.Type.STRING),
                ),
                "gaps": genai_types.Schema(
                    type=genai_types.Type.ARRAY,
                    items=genai_types.Schema(type=genai_types.Type.STRING),
                ),
                "recommendations": genai_types.Schema(
                    type=genai_types.Type.ARRAY,
                    items=genai_types.Schema(type=genai_types.Type.STRING),
                ),
            },
            required=["status", "confidence", "rationale", "evidence", "gaps", "recommendations"],
        )
    def _extract_response_text(self, response) -> str:
        try:
            output = getattr(response, "output", None)
            if not output:
                return ""

            parts: List[str] = []
            for item in output:
                content = getattr(item, "content", None)
                if not content:
                    continue
                for chunk in content:
                    chunk_type = getattr(chunk, "type", None)
                    if chunk_type in {"output_text", "text"}:
                        parts.append(getattr(chunk, "text", ""))
            return "\n".join(filter(None, parts))
        except AttributeError:
            return ""

    def _load_requirements(self) -> List[Dict]:
        """Fetch ISO requirements from Supabase when available, otherwise use local copy."""
        if self.supabase is not None:
            try:
                query = self.supabase.table('iso_requirements').select('*').order('id')
                if self.requirements_limit > 0:
                    query = query.limit(self.requirements_limit)
                response = query.execute()
                if response.data:
                    return response.data
                print("Warning: Supabase returned no requirements. Falling back to local file.")
            except Exception as exc:
                print(f"Warning: Failed to load requirements from Supabase ({exc}). Falling back to local file.")

        requirements = json.loads(self.requirements_path.read_text())
        if self.requirements_limit > 0:
            return requirements[: self.requirements_limit]
        return requirements

    def _generate_summary(self, document_stats: Dict, results: List[Dict]) -> Dict:
        status_counts: Dict[str, int] = {"PASS": 0, "FAIL": 0, "FLAGGED": 0, "NOT_APPLICABLE": 0, "ERROR": 0}
        total_tokens = 0
        for result in results:
            status = result.get("status", "ERROR")
            status_counts[status] = status_counts.get(status, 0) + 1
            total_tokens += result.get("tokens_used", 0)

        scored = len(results) - status_counts.get("ERROR", 0)
        compliance_score = (status_counts.get("PASS", 0) / scored * 100) if scored else 0

        summary = {
            "document_info": document_stats,
            "evaluation_summary": {
                "total_requirements": len(results),
                "compliance_score": round(compliance_score, 1),
                "status_counts": status_counts,
                "total_tokens_used": total_tokens,
                "estimated_cost_usd": round((total_tokens / 1_000_000) * 5, 4),
            },
            "requirements_results": results,
            "generated_at": datetime.utcnow().isoformat(),
        }
        return summary

    def _persist_summary(self, summary: Dict, run_id: str) -> None:
        json_path = self.output_dir / f"vision_evaluation_{run_id}.json"
        json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

        excel_path = self.output_dir / f"vision_evaluation_{run_id}.xlsx"
        self._export_to_excel(summary, excel_path)

    def _export_to_excel(self, summary: Dict, excel_path: Path) -> None:
        workbook = Workbook()
        summary_sheet = workbook.active
        summary_sheet.title = "Summary"

        summary_sheet.append(["Field", "Value"])
        for key, value in summary.get("document_info", {}).items():
            summary_sheet.append([key.replace('_', ' ').title(), value])

        summary_sheet.append([])
        summary_sheet.append(["Metric", "Value"])
        evaluation_summary = summary.get("evaluation_summary", {})
        for key, value in evaluation_summary.items():
            if key == "status_counts":
                continue
            summary_sheet.append([key.replace('_', ' ').title(), value])

        summary_sheet.append([])
        summary_sheet.append(["Status", "Count"])
        for status, count in evaluation_summary.get("status_counts", {}).items():
            summary_sheet.append([status, count])

        self._auto_size_columns(summary_sheet)

        requirements_sheet = workbook.create_sheet(title="Requirements")
        headers = [
            "Requirement ID",
            "Status",
            "Confidence",
            "Rationale",
            "Evidence",
            "Gaps",
            "Recommendations",
            "Tokens Used",
        ]
        requirements_sheet.append(headers)

        for record in summary.get("requirements_results", []):
            # Normalize confidence to uppercase categorical label
            confidence_raw = record.get("confidence", "low")
            confidence_str = str(confidence_raw).strip().lower()
            if confidence_str not in ("low", "medium", "high"):
                confidence_str = "low"
            confidence_label = confidence_str.upper()

            requirements_sheet.append([
                record.get("requirement_id"),
                record.get("status"),
                confidence_label,
                record.get("rationale", ""),
                "\n".join(record.get("evidence", [])),
                "\n".join(record.get("gaps", [])),
                "\n".join(record.get("recommendations", [])),
                record.get("tokens_used", 0),
            ])

        self._auto_size_columns(requirements_sheet)
        workbook.save(excel_path)

    def _auto_size_columns(self, worksheet) -> None:
        for column_cells in worksheet.columns:
            length = max(len(str(cell.value or "")) for cell in column_cells)
            worksheet.column_dimensions[get_column_letter(column_cells[0].column)].width = min(length + 2, 80)

    def _load_cache(self) -> Dict[str, Dict[str, Any]]:
        if self.cache_path.exists():
            try:
                return json.loads(self.cache_path.read_text())
            except json.JSONDecodeError:
                return {}
        return {}

    def _save_cache(self) -> None:
        self.cache_path.write_text(json.dumps(self.file_cache, indent=2), encoding="utf-8")


async def _async_main(file_path: str) -> None:
    evaluator = VisionResponsesEvaluator()
    summary = await evaluator.evaluate_document(file_path)

    counts = summary["evaluation_summary"]["status_counts"]
    print("\n=== Vision Evaluation Complete ===")
    print(f"Document: {summary['document_info']['file_name']}")
    print(f"Model: {summary['document_info']['model']}")
    print(f"Score: {summary['evaluation_summary']['compliance_score']:.1f}%")
    print(f"Tokens used: {summary['evaluation_summary']['total_tokens_used']}")
    print("Status counts:")
    for status, count in counts.items():
        print(f"  {status:<15} {count}")


def main() -> None:
    parser = argparse.ArgumentParser(description="ISO 14971 vision-based evaluator")
    parser.add_argument("file_path", help="Path to PDF file to evaluate")
    args = parser.parse_args()

    asyncio.run(_async_main(args.file_path))


if __name__ == "__main__":
    main()
