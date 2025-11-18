# Recommended ISO 14971 Evaluation Configuration

## Primary Recommendation: Vision Evaluator

Based on comprehensive testing, the **Vision Evaluator with GPT-5 and medium reasoning** provides the best balance of accuracy, speed, and cost.

### Quick Start

```bash
# Ensure environment is configured (already set in .env)
# Run the vision evaluator on your PDF
python test_evaluation/vision_responses_evaluator.py "/path/to/your/document.pdf"
```

### Configuration Settings (already in .env)
- **Model**: `gpt-5`
- **Reasoning Effort**: `medium`
- **Evaluator**: Vision pipeline

### Expected Performance
- **Processing Time**: ~70 seconds
- **Cost**: ~$0.27 per document
- **Token Usage**: ~54,000 tokens
- **Accuracy**: 66.7% compliance score on test documents

### Why Vision Evaluator?

1. **Processes visual elements**: Tables, charts, signatures, formatting
2. **No text extraction artifacts**: Direct PDF interpretation
3. **Fastest processing**: 2-3x faster than text-only
4. **No truncation**: Handles large documents without char limits
5. **Consistent results**: Most reliable across different document types

### Alternative Options

#### Text-Only Evaluator (Secondary Choice)
Use when:
- Working with non-PDF formats (after conversion)
- Cost is critical (slightly cheaper at ~$0.25)
- Visual elements aren't important

```bash
python test_evaluation/test_evaluator.py "/path/to/your/document.pdf"
```

#### Hybrid Evaluator (Special Cases Only)
Use when:
- Need both text extraction AND visual verification
- Willing to pay premium (~$0.49) for dual validation
- Have specific regulatory requirements for multiple verification methods

```bash
python test_evaluation/hybrid_evaluator.py "/path/to/your/document.pdf"
```

### Output Locations

All evaluators save results to:
- **JSON**: `test_evaluation/output/[evaluator]_results/`
- **Excel**: Same directory with detailed breakdown
- **Raw Responses**: `responses/` subdirectory for debugging

### Tips

1. **Document Preparation**: Ensure PDFs are text-searchable (not just scanned images)
2. **Batch Processing**: Run multiple documents sequentially to leverage file upload caching
3. **Review FLAGGED Items**: These require human review to determine if they're truly gaps
4. **Cost Management**: Monitor token usage in the output summaries

### Reasoning Effort Settings

- **Medium (Recommended)**: Best balance of speed and thoroughness
- **High**: Use only when you need exhaustive analysis (2x slower, 20% more tokens)
- **Low**: Not recommended - may miss important nuances

### Model Selection

- **GPT-5 (Recommended)**: Consistent, follows instructions well
- **GPT-5-mini**: Faster but less consistent across different evaluator types

## Support

For issues or questions:
1. Check the raw response files for debugging
2. Review the Excel output for detailed requirement breakdowns
3. Adjust reasoning effort if needed for specific use cases