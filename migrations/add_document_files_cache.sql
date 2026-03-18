-- Migration: Add durable provider file cache for document uploads
-- This table stores provider-specific file handles keyed by file hash so
-- repeated evaluations can reuse existing uploads instead of re-uploading.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS document_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT DEFAULT 'application/pdf',
    file_size_bytes INTEGER,
    openai_file_id TEXT,
    openai_uploaded_at TIMESTAMPTZ,
    gemini_file_id TEXT,
    gemini_file_uri TEXT,
    gemini_uploaded_at TIMESTAMPTZ,
    gemini_expires_at TIMESTAMPTZ,
    claude_file_id TEXT,
    claude_uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_files_hash ON document_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_document_files_storage_path ON document_files(storage_path);

ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'document_files' AND policyname = 'Allow full access to document_files'
    ) THEN
        CREATE POLICY "Allow full access to document_files" ON document_files FOR ALL USING (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_document_files_updated_at'
    ) THEN
        CREATE TRIGGER update_document_files_updated_at
            BEFORE UPDATE ON document_files
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
