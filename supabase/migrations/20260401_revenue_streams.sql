-- ── Revenue streams table — tracking streaming/download/royalty income ────

CREATE TABLE IF NOT EXISTS revenue_streams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  source text not null,
  description text not null,
  amount numeric not null,
  currency text not null default 'EUR',
  period_start date,
  period_end date,
  release_title text,
  status text not null default 'pending',
  invoice_id uuid references invoices(id),
  notes text
);

-- ── Row Level Security ────────────────────────────────────────────────────

ALTER TABLE revenue_streams ENABLE ROW LEVEL SECURITY;

-- Temporary open policy for single-user beta (replace with auth.uid() in Phase 4)
DROP POLICY IF EXISTS allow_all ON revenue_streams;
CREATE POLICY allow_all ON revenue_streams FOR ALL USING (true) WITH CHECK (true);
