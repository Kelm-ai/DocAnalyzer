# ISO 14971 Test Evaluator

A standalone test version of the ISO 14971 compliance evaluator designed for debugging document processing and testing evaluation logic with a limited set of requirements.

## Features

- **Document Processing**: Supports PDF and DOCX files
- **Markdown Conversion**: Shows exactly what text the AI receives
- **Limited Testing**: Evaluates only the first 3 ISO 14971 requirements
- **Debug Output**: Saves prompts, responses, and detailed logs
- **Cost Control**: ~3 API calls instead of 38
- **Visual Reports**: Color-coded console output and formatted tables
- **Vision Mode**: Optional pipeline that uploads the PDF directly to OpenAI for multimodal reasoning

## Quick Start

### 1. Install Dependencies
```bash
pip install --upgrade openai python-docx colorama tabulate openpyxl
```

> **Note:** The vision evaluator requires `openai` 1.0.0 or later. Run `python - <<'PY'`
> `import openai; print(openai.__version__)`
> to confirm after installing.

### 2. Set Environment Variables
```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_MODEL="gpt-5"  # Optional, defaults to gpt-5
```

Optional overrides:

- `EVALUATOR_REASONING_EFFORT` – reasoning effort for the markdown evaluator (default `medium`)

### 3. Run Evaluation
```bash
python test_evaluator.py path/to/your/document.pdf
```

## Test Requirements

The evaluator tests these 3 requirements:

1. **ISO14971-4.1-01**: Risk management process established
2. **ISO14971-4.2-01**: Top management commitment
3. **ISO14971-4.2-02**: Policy for risk acceptability

## Output Files

- Vision pipeline results land in `output/vision_results/` with per-run folders:

```
test_evaluation/
├── output/
│   ├── markdown/                 # Converted document markdown (text pipeline)
│   ├── results/                  # Text pipeline summaries
│   │   ├── evaluation_YYYYMMDD_HHMMSS.json
│   │   ├── evaluation_YYYYMMDD_HHMMSS.xlsx
│   │   ├── prompt_ISO14971_4_1_01.txt
│   │   └── response_ISO14971_4_1_01.txt
│   ├── vision_results/           # Vision pipeline summaries
│   │   ├── vision_evaluation_YYYYMMDD_HHMMSS.json
│   │   ├── vision_evaluation_YYYYMMDD_HHMMSS.xlsx
│   │   └── responses/RunTimestamp/
│   └── hybrid_results/           # Hybrid (markdown + file) summaries
│       ├── hybrid_evaluation_YYYYMMDD_HHMMSS.json
│       ├── hybrid_evaluation_YYYYMMDD_HHMMSS.xlsx
│       └── responses/RunTimestamp/
```

## Vision-Based Evaluator

Run the new OpenAI vision pipeline (PDF only) to compare against the markdown flow:

```bash
python test_evaluation/vision_responses_evaluator.py path/to/document.pdf
```

Each run uploads the PDF to the Files API (cached by SHA-256 hash), reuses the returned `file_id` across the three parallel requirement calls with `gpt-5`, and stores JSON/Excel summaries under `output/vision_results/`.

Optional environment variables for tuning:

- `VISION_EVALUATOR_CONCURRENCY` – parallel OpenAI calls (default 3)
- `VISION_REASONING_EFFORT` – override reasoning effort (default `medium`)

## Hybrid Evaluator

Send the markdown excerpt and attached file together:

```bash
python test_evaluation/hybrid_evaluator.py path/to/document.pdf
```

The script converts the document to markdown (saved under `output/hybrid_markdown/`), truncates it to `HYBRID_CONTEXT_CHAR_LIMIT` (default 90k characters), attaches the original file via the Files API, and runs the three requirements in parallel. Results are written to `output/hybrid_results/`.

Optional environment variables:

- `HYBRID_CONTEXT_CHAR_LIMIT` – characters of markdown context to include (default 90000)
- `HYBRID_EVALUATOR_CONCURRENCY` – parallel OpenAI calls (default 3)
- `HYBRID_REASONING_EFFORT` – override reasoning effort (default `medium`)


## Usage Examples

### Basic Usage
```bash
python test_evaluator.py /path/to/risk-management-plan.pdf
```

### With Custom API Key
```bash
python test_evaluator.py document.docx --api-key sk-your-key-here
```

### View Markdown Only (without evaluation)
Set `OPENAI_API_KEY=""` to skip evaluation and only see markdown conversion.

## Understanding Output

### Console Output
- **Blue sections**: Processing steps
- **Green**: Success messages
- **Yellow**: Warnings (truncation, etc.)
- **Red**: Errors
- **Magenta**: Currently processing

### Evaluation Results
- **PASS**: Requirement fully satisfied
- **FAIL**: No evidence or contradiction
- **FLAGGED**: Incomplete/ambiguous evidence
- **NOT_APPLICABLE**: Doesn't apply to this document

### Confidence Scores
- **0.8-1.0**: High confidence
- **0.6-0.7**: Medium confidence
- **0.0-0.5**: Low confidence

## Debugging Features

1. **Markdown Inspection**: See exactly what text was extracted
2. **Prompt Logging**: Review prompts sent to the AI
3. **Response Logging**: See raw AI responses
4. **Token Tracking**: Monitor API usage and costs
5. **Timing Data**: Identify performance bottlenecks

## Troubleshooting

### "python-docx not installed"
```bash
pip install python-docx
```

### "OPENAI_API_KEY not found"
```bash
export OPENAI_API_KEY="your-key"
```

### "EOF marker not found" (PDF issue)
- File may be corrupted or encrypted
- Try a different PDF or convert to DOCX

### Empty markdown output
- File may be image-based PDF (no extractable text)
- Try OCR preprocessing or DOCX format

## Next Steps

After successful testing:
1. Review markdown quality in `output/markdown/`
2. Check evaluation logic in `output/results/`
3. Adjust prompts if needed
4. Run full evaluation with all 38 requirements
