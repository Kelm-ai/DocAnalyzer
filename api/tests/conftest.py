"""
Pytest configuration and fixtures for API tests.

This module sets up mocks for external dependencies to allow testing
without requiring API keys or network access.
"""

import sys
from unittest.mock import MagicMock


def pytest_configure(config):
    """Set up module mocks before any tests import the vision evaluator."""
    # Mock evaluation_schema
    mock_schema = MagicMock()
    mock_schema.RequirementEvaluationSchema = MagicMock()
    sys.modules['evaluation_schema'] = mock_schema

    # Mock openpyxl
    mock_openpyxl = MagicMock()
    mock_openpyxl.Workbook = MagicMock()
    mock_openpyxl.utils = MagicMock()
    mock_openpyxl.utils.get_column_letter = MagicMock(return_value='A')
    sys.modules['openpyxl'] = mock_openpyxl
    sys.modules['openpyxl.utils'] = mock_openpyxl.utils
