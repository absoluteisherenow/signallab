-- Advance email preview and approval system
-- Adds status workflow: draft → previewed → sent → replied → completed
-- Adds columns for generated email content

-- Add status column with default 'draft'
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- Add email content columns
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS email_html text;

ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

-- Store raw reply text from promoter inbound emails
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS raw_reply text;

-- Set existing records (already sent) to 'sent' status
UPDATE advance_requests
  SET status = 'sent'
  WHERE status = 'draft'
    AND completed = false
    AND created_at < NOW();

-- Set completed records to 'completed'
UPDATE advance_requests
  SET status = 'completed'
  WHERE completed = true
    AND status = 'draft';

-- Index for fast draft lookups
CREATE INDEX IF NOT EXISTS idx_advance_requests_status
  ON advance_requests (status);
