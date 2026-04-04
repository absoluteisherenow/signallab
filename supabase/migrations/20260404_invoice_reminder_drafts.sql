-- Invoice reminder draft system
-- Replaces auto-sending with draft → preview → approve → send workflow

CREATE TABLE IF NOT EXISTS invoice_reminder_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  gig_id uuid REFERENCES gigs(id) ON DELETE SET NULL,
  milestone text NOT NULL,  -- '7d_before', 'due_today', '3d_overdue', '14d_overdue'
  promoter_email text NOT NULL,
  promoter_name text,
  subject text NOT NULL,
  body_text text NOT NULL,  -- Sonnet-generated plain text
  body_html text,           -- HTML version for preview
  status text NOT NULL DEFAULT 'draft',  -- draft → approved → sent
  generated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_drafts_status
  ON invoice_reminder_drafts (status);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_drafts_invoice
  ON invoice_reminder_drafts (invoice_id);
