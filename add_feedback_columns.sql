-- Add feedback columns to requirement_evaluations table
ALTER TABLE requirement_evaluations 
ADD COLUMN IF NOT EXISTS is_helpful BOOLEAN,
ADD COLUMN IF NOT EXISTS feedback_comment TEXT,
ADD COLUMN IF NOT EXISTS feedback_updated_at TIMESTAMP WITH TIME ZONE;
