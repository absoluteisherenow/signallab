-- ── Document Vault table — riders, contracts, invoices, strategy docs ─────

CREATE TABLE IF NOT EXISTS documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  type text not null default 'other',
  file_url text not null,
  file_size integer not null default 0,
  mime_type text not null default 'application/octet-stream',
  notes text,
  tags text[]
);

-- Index for listing documents newest-first
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (type);

-- ── Row Level Security ────────────────────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Temporary open policy for single-user beta (replace with auth.uid() in Phase 4)
DROP POLICY IF EXISTS allow_all ON documents;
CREATE POLICY allow_all ON documents FOR ALL USING (true) WITH CHECK (true);
