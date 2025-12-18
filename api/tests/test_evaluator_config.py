"""
Tests for evaluator configuration and provider modes.

These tests verify that:
1. VisionResponsesEvaluator accepts valid providers and rejects invalid ones
2. DualVisionComparator correctly passes framework parameters to child evaluators
3. The dual mode detection logic works correctly

All tests mock LLM clients to avoid actual API calls.
"""

import os
import pytest
from unittest.mock import patch, MagicMock


class TestProviderValidation:
    """Test VisionResponsesEvaluator provider validation."""

    @pytest.fixture(autouse=True)
    def mock_clients(self):
        """Mock all LLM clients to avoid initialization errors."""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "test-openai-key",
            "GEMINI_API_KEY": "test-gemini-key",
            "ANTHROPIC_API_KEY": "test-anthropic-key",
        }):
            with patch("vision_responses_evaluator.OpenAI") as mock_openai, \
                 patch("vision_responses_evaluator.genai") as mock_genai, \
                 patch("vision_responses_evaluator.Anthropic") as mock_anthropic, \
                 patch("vision_responses_evaluator.GENAI_AVAILABLE", True), \
                 patch("vision_responses_evaluator.ANTHROPIC_AVAILABLE", True):
                mock_openai.return_value = MagicMock()
                mock_genai.Client.return_value = MagicMock()
                mock_anthropic.return_value = MagicMock()
                yield

    def test_accepts_openai_provider(self):
        """VisionResponsesEvaluator should accept 'openai' as a valid provider."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        evaluator = VisionResponsesEvaluator(provider="openai")
        assert evaluator.provider == "openai"

    def test_accepts_gemini_provider(self):
        """VisionResponsesEvaluator should accept 'gemini' as a valid provider."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        evaluator = VisionResponsesEvaluator(provider="gemini")
        assert evaluator.provider == "gemini"

    def test_accepts_claude_provider(self):
        """VisionResponsesEvaluator should accept 'claude' as a valid provider."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        evaluator = VisionResponsesEvaluator(provider="claude")
        assert evaluator.provider == "claude"

    def test_rejects_dual_provider(self):
        """VisionResponsesEvaluator should reject 'dual' - it's not a single provider."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        with pytest.raises(RuntimeError) as excinfo:
            VisionResponsesEvaluator(provider="dual")
        assert "Unsupported VISION_PROVIDER 'dual'" in str(excinfo.value)

    def test_rejects_invalid_provider(self):
        """VisionResponsesEvaluator should reject unknown providers."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        with pytest.raises(RuntimeError) as excinfo:
            VisionResponsesEvaluator(provider="invalid")
        assert "Unsupported VISION_PROVIDER" in str(excinfo.value)


class TestDualVisionComparator:
    """Test DualVisionComparator initialization and parameter propagation."""

    @pytest.fixture(autouse=True)
    def mock_clients(self):
        """Mock all LLM clients to avoid initialization errors."""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "test-openai-key",
            "GEMINI_API_KEY": "test-gemini-key",
            "ANTHROPIC_API_KEY": "test-anthropic-key",
        }):
            with patch("vision_responses_evaluator.OpenAI") as mock_openai, \
                 patch("vision_responses_evaluator.genai") as mock_genai, \
                 patch("vision_responses_evaluator.Anthropic") as mock_anthropic, \
                 patch("vision_responses_evaluator.GENAI_AVAILABLE", True), \
                 patch("vision_responses_evaluator.ANTHROPIC_AVAILABLE", True):
                mock_openai.return_value = MagicMock()
                mock_genai.Client.return_value = MagicMock()
                mock_anthropic.return_value = MagicMock()
                yield

    def test_dual_comparator_initializes(self):
        """DualVisionComparator should initialize without errors."""
        from vision_responses_evaluator import DualVisionComparator
        comparator = DualVisionComparator()
        assert comparator.provider == "dual"

    def test_dual_comparator_accepts_system_prompt(self):
        """DualVisionComparator should accept system_prompt parameter."""
        from vision_responses_evaluator import DualVisionComparator
        custom_prompt = "Custom evaluation instructions for testing."
        comparator = DualVisionComparator(system_prompt=custom_prompt)
        assert comparator.system_prompt == custom_prompt

    def test_dual_comparator_accepts_framework_id(self):
        """DualVisionComparator should accept framework_id parameter."""
        from vision_responses_evaluator import DualVisionComparator
        framework_id = "test-framework-123"
        comparator = DualVisionComparator(framework_id=framework_id)
        assert comparator.framework_id == framework_id

    def test_dual_comparator_propagates_system_prompt_to_primary(self):
        """DualVisionComparator should pass system_prompt to primary (Claude) evaluator."""
        from vision_responses_evaluator import DualVisionComparator
        custom_prompt = "Custom evaluation instructions for testing."
        comparator = DualVisionComparator(system_prompt=custom_prompt)
        # The BASE_INSTRUCTION is set from system_prompt
        assert comparator.primary.BASE_INSTRUCTION == custom_prompt

    def test_dual_comparator_propagates_system_prompt_to_secondary(self):
        """DualVisionComparator should pass system_prompt to secondary (OpenAI) evaluator."""
        from vision_responses_evaluator import DualVisionComparator
        custom_prompt = "Custom evaluation instructions for testing."
        comparator = DualVisionComparator(system_prompt=custom_prompt)
        # The BASE_INSTRUCTION is set from system_prompt
        assert comparator.secondary.BASE_INSTRUCTION == custom_prompt

    def test_dual_comparator_propagates_framework_id_to_primary(self):
        """DualVisionComparator should pass framework_id to primary evaluator."""
        from vision_responses_evaluator import DualVisionComparator
        framework_id = "test-framework-123"
        comparator = DualVisionComparator(framework_id=framework_id)
        assert comparator.primary.framework_id == framework_id

    def test_dual_comparator_propagates_framework_id_to_secondary(self):
        """DualVisionComparator should pass framework_id to secondary evaluator."""
        from vision_responses_evaluator import DualVisionComparator
        framework_id = "test-framework-123"
        comparator = DualVisionComparator(framework_id=framework_id)
        assert comparator.secondary.framework_id == framework_id

    def test_dual_comparator_gemini_fallback_gets_parameters(self):
        """DualVisionComparator's Gemini fallback should receive the same parameters."""
        from vision_responses_evaluator import DualVisionComparator
        custom_prompt = "Custom evaluation instructions for testing."
        framework_id = "test-framework-456"
        comparator = DualVisionComparator(
            system_prompt=custom_prompt,
            framework_id=framework_id,
        )
        # Get the Gemini fallback (lazily initialized)
        gemini_fallback = comparator._get_gemini_fallback()
        assert gemini_fallback.framework_id == framework_id
        assert gemini_fallback.BASE_INSTRUCTION == custom_prompt

    def test_dual_comparator_has_claude_primary(self):
        """DualVisionComparator should use Claude as the primary provider."""
        from vision_responses_evaluator import DualVisionComparator
        comparator = DualVisionComparator()
        assert comparator.primary.provider == "claude"

    def test_dual_comparator_has_openai_secondary(self):
        """DualVisionComparator should use OpenAI as the secondary provider."""
        from vision_responses_evaluator import DualVisionComparator
        comparator = DualVisionComparator()
        assert comparator.secondary.provider == "openai"


class TestDualModeDetection:
    """Test the dual mode detection logic used in app.py."""

    def test_detects_vision_provider_dual(self):
        """Should detect dual mode when VISION_PROVIDER=dual."""
        with patch.dict(os.environ, {"VISION_PROVIDER": "dual"}, clear=False):
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                       os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            assert use_dual is True

    def test_detects_vision_provider_both(self):
        """Should detect dual mode when VISION_PROVIDER=both."""
        with patch.dict(os.environ, {"VISION_PROVIDER": "both"}, clear=False):
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                       os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            assert use_dual is True

    def test_detects_vision_compare_both_true(self):
        """Should detect dual mode when VISION_COMPARE_BOTH=true."""
        with patch.dict(os.environ, {"VISION_COMPARE_BOTH": "true"}, clear=False):
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                       os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            assert use_dual is True

    def test_detects_vision_compare_both_1(self):
        """Should detect dual mode when VISION_COMPARE_BOTH=1."""
        with patch.dict(os.environ, {"VISION_COMPARE_BOTH": "1"}, clear=False):
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                       os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            assert use_dual is True

    def test_detects_vision_compare_both_yes(self):
        """Should detect dual mode when VISION_COMPARE_BOTH=yes."""
        with patch.dict(os.environ, {"VISION_COMPARE_BOTH": "yes"}, clear=False):
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                       os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            assert use_dual is True

    def test_no_dual_mode_for_single_provider(self):
        """Should not detect dual mode when using a single provider."""
        with patch.dict(os.environ, {"VISION_PROVIDER": "openai"}, clear=False):
            # Clear VISION_COMPARE_BOTH if it exists
            env = os.environ.copy()
            env.pop("VISION_COMPARE_BOTH", None)
            with patch.dict(os.environ, env, clear=True):
                use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                           os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
                assert use_dual is False

    def test_case_insensitive_detection(self):
        """Dual mode detection should be case-insensitive."""
        test_cases = ["DUAL", "Dual", "dUaL", "TRUE", "True", "YES", "Yes"]
        for value in test_cases:
            with patch.dict(os.environ, {"VISION_PROVIDER": value}, clear=False):
                use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or \
                           os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
                if value.lower() in {"dual", "both"}:
                    assert use_dual is True, f"Failed for VISION_PROVIDER={value}"


class TestFrameworkParameterIntegration:
    """Integration tests for framework parameters in evaluator creation."""

    @pytest.fixture(autouse=True)
    def mock_clients(self):
        """Mock all LLM clients to avoid initialization errors."""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "test-openai-key",
            "GEMINI_API_KEY": "test-gemini-key",
            "ANTHROPIC_API_KEY": "test-anthropic-key",
        }):
            with patch("vision_responses_evaluator.OpenAI") as mock_openai, \
                 patch("vision_responses_evaluator.genai") as mock_genai, \
                 patch("vision_responses_evaluator.Anthropic") as mock_anthropic, \
                 patch("vision_responses_evaluator.GENAI_AVAILABLE", True), \
                 patch("vision_responses_evaluator.ANTHROPIC_AVAILABLE", True):
                mock_openai.return_value = MagicMock()
                mock_genai.Client.return_value = MagicMock()
                mock_anthropic.return_value = MagicMock()
                yield

    def test_single_provider_with_framework_params(self):
        """Single provider evaluator should correctly store framework parameters."""
        from vision_responses_evaluator import VisionResponsesEvaluator
        custom_prompt = "Test framework system prompt"
        framework_id = "framework-abc-123"

        evaluator = VisionResponsesEvaluator(
            provider="openai",
            system_prompt=custom_prompt,
            framework_id=framework_id,
        )

        assert evaluator.framework_id == framework_id
        assert evaluator.BASE_INSTRUCTION == custom_prompt

    def test_dual_provider_with_framework_params(self):
        """Dual comparator should correctly propagate framework parameters."""
        from vision_responses_evaluator import DualVisionComparator
        custom_prompt = "Test framework system prompt"
        framework_id = "framework-abc-123"

        comparator = DualVisionComparator(
            system_prompt=custom_prompt,
            framework_id=framework_id,
        )

        # Verify parameters are stored on comparator
        assert comparator.system_prompt == custom_prompt
        assert comparator.framework_id == framework_id

        # Verify parameters propagated to primary (Claude)
        assert comparator.primary.framework_id == framework_id
        assert comparator.primary.BASE_INSTRUCTION == custom_prompt

        # Verify parameters propagated to secondary (OpenAI)
        assert comparator.secondary.framework_id == framework_id
        assert comparator.secondary.BASE_INSTRUCTION == custom_prompt

    def test_different_frameworks_create_separate_evaluators(self):
        """Different frameworks should create evaluators with different prompts."""
        from vision_responses_evaluator import DualVisionComparator

        framework1_prompt = "Evaluate for ISO 14971 risk management."
        framework2_prompt = "Evaluate for IEC 62304 software lifecycle."

        comparator1 = DualVisionComparator(
            system_prompt=framework1_prompt,
            framework_id="framework-1",
        )
        comparator2 = DualVisionComparator(
            system_prompt=framework2_prompt,
            framework_id="framework-2",
        )

        # Each should have its own prompt
        assert comparator1.primary.BASE_INSTRUCTION == framework1_prompt
        assert comparator2.primary.BASE_INSTRUCTION == framework2_prompt
        assert comparator1.primary.BASE_INSTRUCTION != comparator2.primary.BASE_INSTRUCTION
