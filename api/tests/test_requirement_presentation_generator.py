import asyncio


try:
    from requirement_presentation_generator import (
        OpenAIPdfPresentationGenerator,
        RequirementPresentationSummary,
        _StructuredSynthesisResponse,
        _apply_synthesis,
        _default_presentation,
    )
except ImportError:
    from api.requirement_presentation_generator import (
        OpenAIPdfPresentationGenerator,
        RequirementPresentationSummary,
        _StructuredSynthesisResponse,
        _apply_synthesis,
        _default_presentation,
    )


def _base_requirement(**overrides):
    record = {
        "requirement_id": "REQ-1",
        "requirement_clause": "4.1",
        "title": "Risk management process",
        "status": "PASS",
        "confidence_level": "high",
        "evaluation_rationale": "The SOP documents a defined risk management process that addresses this requirement.",
        "evidence_snippets": [
            '6.3.1 Risk Management Plan: "A Risk Management Plan shall document the scope of planned risk management activities." (page 4).'
        ],
        "gaps_identified": [],
    }
    record.update(overrides)
    return record


def _make_summary(requirement, *, per_group=10, max_groups=12, per_requirement=40):
    return _default_presentation(
        requirement,
        max_citations_per_group=per_group,
        max_groups_per_requirement=max_groups,
        max_citations_per_requirement=per_requirement,
    )


def test_v3_pass_preserves_multiple_evidence_items_until_ceiling():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[
                'Section 4.1: "Risk management activities shall be planned and maintained." (page 2).',
                'Section 4.2: "The plan defines responsibilities and review points." (page 3).',
                'Section 4.3: "The procedure requires ongoing review of risk activities." (page 4).',
                'Section 4.4: "Outputs are recorded in the risk management file." (page 5).',
                'Section 4.5: "Post-production inputs feed back into the process." (page 6).',
            ]
        )
    )

    assert isinstance(summary, RequirementPresentationSummary)
    assert summary.presentation_version == "openai-finding-v3"
    assert summary.inline_finding.id == "finding"
    assert summary.inline_caveat is None
    assert len(summary.evidence_groups) == 5
    assert all(group.label == "Document evidence" for group in summary.evidence_groups)
    assert all(group.claim_id == "finding" for group in summary.evidence_groups)
    assert sum(len(group.citations) for group in summary.evidence_groups) == 5


def test_v3_fail_yields_multiple_observed_limitation_groups():
    summary = _make_summary(
        _base_requirement(
            status="FAIL",
            confidence_level="medium",
            evaluation_rationale="The document does not define a repeatable risk assessment methodology.",
            evidence_snippets=[
                'Section 4.2: "Risks are managed appropriately." (page 2).'
            ],
            gaps_identified=[
                'Section 4.2: "Risks are managed appropriately." (page 2).',
                "No documented methodology for identifying and analyzing risks was found.",
                "Acceptance criteria for risk decisions are not defined.",
            ],
        )
    )

    limitation_groups = [group for group in summary.evidence_groups if group.label == "Observed limitation"]
    assert summary.inline_caveat is not None
    assert summary.inline_caveat.id == "caveat"
    assert len(limitation_groups) == 3
    assert all(group.claim_id == "caveat" for group in limitation_groups)
    assert any(group.citations and group.citations[0].label == "p.2" for group in limitation_groups)


def test_v3_flagged_uses_needs_verification_groups():
    summary = _make_summary(
        _base_requirement(
            status="FLAGGED",
            confidence_level="medium",
            evaluation_rationale="The document references review activities, but the evidence is still incomplete.",
            evidence_snippets=[
                'Section 7.1: "Periodic reviews occur." (page 7).'
            ],
            gaps_identified=[
                "The referenced review process is not described clearly enough to confirm compliance."
            ],
        )
    )

    verification_groups = [group for group in summary.evidence_groups if group.label == "Needs verification"]
    assert summary.inline_caveat is not None
    assert summary.inline_caveat.text.startswith("The referenced review process is not described clearly enough")
    assert len(verification_groups) == 1
    assert verification_groups[0].claim_id == "caveat"


def test_v3_deduplicates_repeated_citations_within_each_claim():
    repeated = 'Section 4.1: "Risk management activities shall be planned and maintained." (page 2).'
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[repeated, repeated],
            gaps_identified=[repeated],
        )
    )

    finding_groups = [group for group in summary.evidence_groups if group.claim_id == "finding"]
    caveat_groups = [group for group in summary.evidence_groups if group.claim_id == "caveat"]

    finding_citations = [
        (citation.location, citation.excerpt)
        for group in finding_groups
        for citation in group.citations
    ]
    caveat_citations = [
        (citation.location, citation.excerpt)
        for group in caveat_groups
        for citation in group.citations
    ]

    assert len(finding_citations) == len(set(finding_citations))
    assert len(caveat_citations) == len(set(caveat_citations))


def test_v3_configurable_ceilings_clamp_groups_and_citations():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[
                'Section 4.1: "One." (page 1).',
                'Section 4.2: "Two." (page 2).',
                'Section 4.3: "Three." (page 3).',
                'Section 4.4: "Four." (page 4).',
            ],
            gaps_identified=[
                'Section 5.1: "Five." (page 5).',
                'Section 5.2: "Six." (page 6).',
            ],
        ),
        per_group=1,
        max_groups=3,
        per_requirement=2,
    )

    assert len(summary.evidence_groups) == 3
    assert sum(len(group.citations) for group in summary.evidence_groups) == 2
    assert max(len(group.citations) for group in summary.evidence_groups) <= 1


def test_v3_prefers_structured_evidence_supports_for_group_text():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[],
            structured_evidence=[
                {
                    "page_number": 8,
                    "section_title": "7.2 Management Review",
                    "quote": "Management review records are maintained.",
                    "supports": "Shows management review records are retained and controlled.",
                    "document_name": "Quality Manual.pdf",
                }
            ],
        )
    )

    assert len(summary.evidence_groups) == 1
    assert summary.evidence_groups[0].text == "Shows management review records are retained and controlled."
    assert summary.evidence_groups[0].citations[0].excerpt == "Management review records are maintained."
    assert "Quality Manual.pdf" in summary.evidence_groups[0].citations[0].location


def test_apply_synthesis_rewrites_text_without_dropping_v3_groups():
    baseline = _make_summary(_base_requirement())
    payload = _StructuredSynthesisResponse(
        inline_finding="The procedure establishes an ongoing risk management process.",
        inline_caveat="The plan update triggers are only implied and should be checked by a reviewer.",
        modal_summary="The document describes the core process and includes a documented plan, but some update details remain implicit.",
    )

    summary = _apply_synthesis(baseline, payload)

    assert summary.inline_finding.text == "The procedure establishes an ongoing risk management process."
    assert summary.inline_caveat is not None
    assert summary.inline_caveat.id == "caveat"
    assert summary.modal_summary.startswith("The document describes the core process")
    assert summary.evidence_groups == baseline.evidence_groups


def test_generator_returns_full_v3_fallback_when_parse_returns_no_payload():
    class _FakeResponses:
        def parse(self, **_kwargs):
            return type("Parsed", (), {"output_parsed": None})()

    class _FakeClient:
        def __init__(self):
            self.responses = _FakeResponses()

    async def scenario():
        generator = OpenAIPdfPresentationGenerator(client=_FakeClient(), model="gpt-5")
        requirement_id, payload = await generator._generate_requirement_presentation(
            _base_requirement(
                evidence_snippets=[
                    'Section 4.1: "One." (page 1).',
                    'Section 4.2: "Two." (page 2).',
                    'Section 4.3: "Three." (page 3).',
                ]
            ),
            {"file_id": "file_123", "file_name": "doc.pdf"},
            asyncio.Semaphore(1),
        )
        return requirement_id, payload

    requirement_id, payload = asyncio.run(scenario())

    assert requirement_id == "REQ-1"
    assert payload["presentation_version"] == "openai-finding-v3"
    assert payload["inline_finding"]["id"] == "finding"
    assert len(payload["evidence_groups"]) == 3


def test_v3_pass_with_no_evidence_shows_fallback_text():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[],
            structured_evidence=[],
        )
    )
    assert len(summary.evidence_groups) == 1
    assert summary.evidence_groups[0].label == "Document evidence"
    assert "no usable citation" in summary.evidence_groups[0].text.lower()


def test_v3_cross_reference_evidence_is_labeled_as_cross_reference():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[],
            structured_evidence=[
                {
                    "section_title": "5.1 Training",
                    "quote": "Training records are maintained in accordance with SOP QAP011.",
                    "supports": "This is a specific cross-reference to the controlled training-record SOP.",
                    "evidence_type": "cross_reference",
                }
            ],
        )
    )

    assert summary.evidence_groups[0].citations[0].label == "5.1 Training"
    assert summary.evidence_groups[0].citations[0].location == "5.1 Training"


def test_v3_pass_gap_links_to_related_figure_evidence():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[],
            structured_evidence=[
                {
                    "page_number": 11,
                    "section_title": "Figure 1 - Schematic Representation of the Risk Management Process",
                    "quote": "Figure 1 - Schematic Representation of the Risk Management Process",
                    "supports": "The figure depicts the end-to-end process flow.",
                    "document_name": "PD-002 Risk Management Procedure for Combination Products",
                    "evidence_type": "visual_or_table",
                }
            ],
            gaps_identified=[
                "The flowchart in Figure 1 could be enhanced to show explicit touchpoints with other QMS processes like change control and CAPA."
            ],
        )
    )

    limitation_groups = [group for group in summary.evidence_groups if group.label == "Observed limitation"]
    assert len(limitation_groups) == 1
    assert len(limitation_groups[0].citations) == 1
    assert limitation_groups[0].citations[0].label == "p.11"
    assert limitation_groups[0].citations[0].location.endswith("Page 11")


def test_v3_pass_gap_without_matching_evidence_does_not_create_synthetic_source_citation():
    summary = _make_summary(
        _base_requirement(
            evidence_snippets=[],
            structured_evidence=[
                {
                    "page_number": 3,
                    "section_title": "4.1 Process Scope",
                    "quote": "The process applies across the lifecycle.",
                    "supports": "Shows lifecycle coverage.",
                }
            ],
            gaps_identified=[
                "A glossary for uncommon acronyms could improve readability."
            ],
        )
    )

    limitation_groups = [group for group in summary.evidence_groups if group.label == "Observed limitation"]
    assert len(limitation_groups) == 1
    assert limitation_groups[0].citations == []
