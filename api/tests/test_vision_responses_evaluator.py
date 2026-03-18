try:
    from vision_responses_evaluator import VisionResponsesEvaluator
except ImportError:
    from api.vision_responses_evaluator import VisionResponsesEvaluator


def _make_evaluator() -> VisionResponsesEvaluator:
    evaluator = VisionResponsesEvaluator.__new__(VisionResponsesEvaluator)
    evaluator.BASE_INSTRUCTION = "Base instruction"
    evaluator._supporting_docs_context = None
    evaluator._supporting_doc_names = []
    return evaluator


def test_build_prompt_requires_evidence_type_and_ids():
    evaluator = _make_evaluator()

    prompt = evaluator._build_prompt(
        {
            "id": "REQ-1",
            "clause": "4.1",
            "title": "Risk management process",
            "requirement_text": "Core evidence to look for (minimal subset for PASS): documented procedure",
        }
    )

    assert '"evidence_id": "E1"' in prompt
    assert '"evidence_type": "direct_quote|cross_reference|visual_or_table"' in prompt
    assert "Reference only evidence IDs you returned" in prompt
    assert "Do not return PASS with evidence: []" in prompt


def test_build_prompt_adds_citation_retry_instruction():
    evaluator = _make_evaluator()

    prompt = evaluator._build_prompt(
        {"id": "REQ-1", "title": "Risk management process"},
        citation_retry=True,
    )

    assert "CITATION RETRY" in prompt
    assert "return FLAGGED instead of PASS" in prompt


def test_build_prompt_sections_keep_requirement_in_separate_suffix():
    evaluator = _make_evaluator()
    evaluator._supporting_docs_context = "Supporting summary"

    shared_prompt, requirement_prompt = evaluator._build_prompt_sections(
        {
            "id": "REQ-1",
            "clause": "4.1",
            "title": "Risk management process",
            "requirement_text": "Documented procedure",
        }
    )

    assert "Supporting summary" in shared_prompt
    assert "Requirement:" not in shared_prompt
    assert "Requirement:" in requirement_prompt
    assert "REQ-1" in requirement_prompt


def test_openai_content_items_put_shared_files_before_requirement_prompt():
    evaluator = _make_evaluator()
    evaluator.provider = "openai"
    evaluator.model = "gpt-5.4"
    evaluator.evaluation_id = "eval-123"

    content_items, prompt_cache_key = evaluator._build_openai_content_items(
        {
            "file_id": "file-primary",
            "file_hash": "hash-primary",
            "supporting_docs": [{"file_id": "file-support-1"}],
        },
        {"id": "REQ-1", "title": "Risk management process"},
    )

    assert prompt_cache_key == "vision-eval:openai:gpt-5.4:eval-123:standard"
    assert [item["type"] for item in content_items] == [
        "input_text",
        "input_file",
        "input_file",
        "input_text",
    ]
    assert "Requirement:" in content_items[-1]["text"]


def test_claude_content_items_add_cache_breakpoint_before_requirement_prompt():
    evaluator = _make_evaluator()

    content_items = evaluator._build_claude_content_items(
        {
            "file_id": "file-primary",
            "supporting_docs": [{"file_id": "file-support-1"}],
        },
        {"id": "REQ-1", "title": "Risk management process"},
    )

    assert [item["type"] for item in content_items] == [
        "document",
        "document",
        "text",
        "text",
    ]
    assert content_items[-2]["cache_control"] == {"type": "ephemeral"}
    assert "Requirement:" in content_items[-1]["text"]


def test_pass_evidence_gate_accepts_single_strong_direct_quote():
    evaluator = _make_evaluator()

    gate = evaluator._build_pass_evidence_gate(
        {
            "status": "PASS",
            "evidence": [
                {
                    "evidence_id": "E1",
                    "evidence_type": "direct_quote",
                    "page_number": 3,
                    "section_title": "4.1 Procedure",
                    "quote": "The risk management procedure shall be maintained.",
                    "supports": "Directly states that the required procedure exists and is maintained.",
                }
            ],
        }
    )

    assert gate["has_usable_evidence"] is True
    assert gate["usable_evidence_count"] == 1


def test_pass_evidence_gate_rejects_empty_evidence():
    evaluator = _make_evaluator()

    gate = evaluator._build_pass_evidence_gate({"status": "PASS", "evidence": []})

    assert gate["has_usable_evidence"] is False
    assert "missing_evidence" in gate["flags"]


def test_downgrade_pass_for_citation_failure_marks_flagged_and_sets_metadata():
    evaluator = _make_evaluator()

    downgraded = evaluator._downgrade_pass_for_citation_failure(
        {
            "status": "PASS",
            "confidence": "high",
            "rationale": "The document appears to satisfy the requirement.",
            "gaps": [],
            "recommendations": [],
        },
        ["missing_evidence"],
    )

    assert downgraded["status"] == "FLAGGED"
    assert downgraded["confidence"] == "low"
    assert "did not provide usable supporting evidence" in downgraded["rationale"]
    assert downgraded["metadata"]["citation_gate"]["status"] == "downgraded_to_flagged"
