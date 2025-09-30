#!/bin/bash

# ISO 14971 Test Evaluator - Example Usage
# This script demonstrates how to use the test evaluator

echo "=== ISO 14971 Test Evaluator Examples ==="
echo ""

# Example 1: Document processing only (no API key needed)
echo "1. Document Processing Only (Markdown Output)"
echo "   Command: OPENAI_API_KEY=\"test\" python test_evaluator.py document.pdf"
echo "   Result: Shows markdown conversion without evaluation"
echo ""

# Example 2: Full evaluation with API key
echo "2. Full Evaluation (with OpenAI API)"
echo "   Command: python test_evaluator.py document.pdf --api-key sk-your-key"
echo "   Result: Complete evaluation with AI analysis"
echo ""

# Example 3: Environment variable method
echo "3. Using Environment Variables"
echo "   export OPENAI_API_KEY=\"your-api-key\""
echo "   export OPENAI_MODEL=\"gpt-5\""
echo "   python test_evaluator.py document.docx"
echo ""

echo "4. Vision Pipeline (PDF Only)"
echo "   Command: python vision_responses_evaluator.py document.pdf"
echo "   Result: Uploads the PDF once to OpenAI vision and runs the three test requirements"
echo ""

echo "5. Hybrid (Markdown + File Attachment)"
echo "   Command: python hybrid_evaluator.py document.pdf"
echo "   Result: Sends markdown context and the uploaded file to gpt-5-mini for richer analysis"
echo ""

echo "=== Available Test Documents ==="
echo ""

# Find available test documents
if [ -d "/Users/matthewparson/Desktop/SC/Risk Management" ]; then
    echo "Found these test documents:"
    find "/Users/matthewparson/Desktop/SC/Risk Management" -type f \( -name "*.pdf" -o -name "*.docx" \) | head -3 | while read file; do
        echo "  - $(basename "$file")"
    done
else
    echo "Place your PDF or DOCX files in the test_documents/ folder"
fi

echo ""
echo "=== Quick Test ==="
echo "To test document processing without API costs:"
echo ""
echo "OPENAI_API_KEY=\"test\" python test_evaluator.py \"path/to/your/document.pdf\""
echo ""
echo "This will:"
echo "  ✓ Convert document to markdown"
echo "  ✓ Save markdown to output/markdown/"
echo "  ✓ Show document statistics"
echo "  ✗ Skip AI evaluation (saves API costs)"
