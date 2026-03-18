from evidence_utils import (
    assess_evidence_item_quality,
    evidence_item_to_legacy_snippet,
    normalize_evidence_items,
)


def test_normalize_evidence_items_accepts_structured_objects():
    evidence = normalize_evidence_items(
        [
            {
                "page_number": 12,
                "section_title": "7.2 Management Review",
                "quote": "Management review records are maintained.",
                "supports": "Shows the procedure requires retained management review records.",
                "document_name": "Quality Manual.pdf",
            }
        ]
    )

    assert evidence == [
        {
            "page_number": 12,
            "section_title": "7.2 Management Review",
            "quote": "Management review records are maintained.",
            "supports": "Shows the procedure requires retained management review records.",
            "document_name": "Quality Manual.pdf",
            "evidence_id": None,
            "evidence_type": "direct_quote",
        }
    ]


def test_normalize_evidence_items_converts_legacy_strings():
    evidence = normalize_evidence_items(
        ['Section 4.1: "Risk management activities shall be planned and maintained." (page 2).']
    )

    assert evidence[0]["page_number"] == 2
    assert evidence[0]["section_title"] == "Section 4.1"
    assert evidence[0]["quote"] == "Risk management activities shall be planned and maintained."
    assert "Section 4.1" in evidence[0]["supports"]
    assert evidence[0]["evidence_type"] == "direct_quote"


def test_normalize_evidence_items_handles_missing_page_and_section():
    evidence = normalize_evidence_items(
        [{"quote": "Records are retained.", "supports": "Shows retention is required."}]
    )

    assert evidence == [
        {
            "page_number": None,
            "section_title": None,
            "quote": "Records are retained.",
            "supports": "Shows retention is required.",
            "document_name": None,
            "evidence_id": None,
            "evidence_type": "direct_quote",
        }
    ]


def test_evidence_item_to_legacy_snippet_preserves_document_context():
    snippet = evidence_item_to_legacy_snippet(
        {
            "page_number": 4,
            "section_title": "6.3.1 Risk Management Plan",
            "quote": "A Risk Management Plan shall document the scope.",
            "supports": "Shows the plan must define the scope of activities.",
            "document_name": "Quality Manual.pdf",
        }
    )

    assert snippet.startswith("[Quality Manual.pdf] 6.3.1 Risk Management Plan • p.4:")
    assert "Shows the plan must define the scope of activities." in snippet


def test_normalize_evidence_items_preserves_quotes_within_300_chars():
    long_quote = "A" * 280
    evidence = normalize_evidence_items(
        [{"quote": long_quote, "supports": "Test."}]
    )
    assert evidence[0]["quote"] == long_quote  # not truncated


def test_normalize_evidence_items_truncates_quotes_beyond_300_chars():
    long_quote = "word " * 80  # 400 chars
    evidence = normalize_evidence_items(
        [{"quote": long_quote, "supports": "Test."}]
    )
    assert len(evidence[0]["quote"]) <= 300
    assert evidence[0]["quote"].endswith("...")


def test_normalize_evidence_items_preserves_supports_within_350_chars():
    long_supports = "B" * 340
    evidence = normalize_evidence_items(
        [{"quote": "Test.", "supports": long_supports}]
    )
    assert evidence[0]["supports"] == long_supports


def test_normalize_evidence_items_truncates_supports_beyond_350_chars():
    long_supports = "word " * 80  # 400 chars
    evidence = normalize_evidence_items(
        [{"quote": "Test.", "supports": long_supports}]
    )
    assert len(evidence[0]["supports"]) <= 350
    assert evidence[0]["supports"].endswith("...")


def test_normalize_evidence_items_does_not_backfill_quote_from_supports():
    evidence = normalize_evidence_items([{"supports": "Shows retention is required."}])
    assert evidence[0]["quote"] == ""
    assert evidence[0]["supports"] == "Shows retention is required."


def test_normalize_evidence_items_does_not_backfill_supports_from_quote():
    evidence = normalize_evidence_items([{"quote": "Records are retained."}])
    assert evidence[0]["quote"] == "Records are retained."
    assert evidence[0]["supports"] == ""


def test_assess_evidence_item_quality_recognizes_specific_cross_reference():
    quality = assess_evidence_item_quality(
        {
            "quote": "Training records are maintained in accordance with SOP QAP011.",
            "supports": "This is a specific cross-reference to the controlled training-record SOP.",
            "evidence_type": "cross_reference",
        }
    )

    assert quality["is_cross_reference"] is True
    assert quality["is_specific_cross_reference"] is True
    assert quality["usable_for_pass"] is True


def test_evidence_item_to_legacy_snippet_labels_cross_references():
    snippet = evidence_item_to_legacy_snippet(
        {
            "section_title": "5.1 Training",
            "quote": "Training records are maintained in accordance with SOP QAP011.",
            "supports": "This cross-reference points to the controlled training-record procedure.",
            "evidence_type": "cross_reference",
        }
    )

    assert snippet.startswith("Cross-reference • 5.1 Training")
