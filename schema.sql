-- Database schema for ISO 14971 Compliance Evaluator
-- Run this in your Supabase SQL Editor

-- ISO Requirements table
CREATE TABLE IF NOT EXISTS iso_requirements (
    id TEXT PRIMARY KEY,
    clause TEXT NOT NULL,
    title TEXT NOT NULL,
    requirement_text TEXT NOT NULL,
    acceptance_criteria TEXT,
    expected_artifacts TEXT,
    evaluation_type TEXT,
    guidance_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document Evaluations table
CREATE TABLE IF NOT EXISTS document_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_requirements INTEGER,
    requirements_passed INTEGER DEFAULT 0,
    requirements_failed INTEGER DEFAULT 0,
    requirements_flagged INTEGER DEFAULT 0,
    requirements_na INTEGER DEFAULT 0,
    overall_compliance_score NUMERIC(5,2),
    evaluation_method TEXT,
    model_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual Requirement Evaluations table
-- NOTE: confidence_level is the canonical field storing categorical values ('low', 'medium', 'high')
-- For backwards compatibility, a legacy confidence_score NUMERIC column may exist in older deployments
-- The application automatically falls back to confidence_score if confidence_level column is missing
CREATE TABLE IF NOT EXISTS requirement_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_evaluation_id UUID REFERENCES document_evaluations(id) ON DELETE CASCADE,
    requirement_id TEXT REFERENCES iso_requirements(id),
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'FLAGGED', 'PARTIAL', 'NOT_APPLICABLE', 'ERROR')),
    confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
    evidence_snippets TEXT[],
    evaluation_rationale TEXT,
    gaps_identified TEXT[],
    recommendations TEXT[],
    tokens_used INTEGER,
    is_helpful BOOLEAN,
    feedback_comment TEXT,
    feedback_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_evaluation_id UUID REFERENCES document_evaluations(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    summary_stats JSONB,
    by_clause JSONB,
    high_risk_findings TEXT[],
    key_gaps TEXT[],
    report_format TEXT DEFAULT 'json',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Processed document cache (Document Intelligence output)
CREATE TABLE IF NOT EXISTS processed_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    markdown_content TEXT,
    page_count INTEGER,
    extraction_metadata JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'processed'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_evaluations_status ON document_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_requirement_evaluations_doc_id ON requirement_evaluations(document_evaluation_id);
CREATE INDEX IF NOT EXISTS idx_requirement_evaluations_req_id ON requirement_evaluations(requirement_id);
CREATE INDEX IF NOT EXISTS idx_requirement_evaluations_status ON requirement_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_doc_id ON compliance_reports(document_evaluation_id);
CREATE INDEX IF NOT EXISTS idx_processed_documents_filename ON processed_documents(filename);

-- Enable Row Level Security (RLS) - optional, adjust based on your needs
ALTER TABLE iso_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;

-- Create policies (example - adjust based on your authentication needs)
CREATE POLICY "Allow read access to iso_requirements" ON iso_requirements FOR SELECT USING (true);
CREATE POLICY "Allow full access to document_evaluations" ON document_evaluations FOR ALL USING (true);
CREATE POLICY "Allow full access to requirement_evaluations" ON requirement_evaluations FOR ALL USING (true);
CREATE POLICY "Allow full access to compliance_reports" ON compliance_reports FOR ALL USING (true);
CREATE POLICY "Allow full access to processed_documents" ON processed_documents FOR ALL USING (true);
