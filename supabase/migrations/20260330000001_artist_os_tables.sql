-- Connected email accounts for multi-Gmail support
CREATE TABLE IF NOT EXISTS connected_email_accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  label text not null default 'Primary',
  access_token text,
  refresh_token text,
  token_expiry bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Expense tracking (UK MTD)
CREATE TABLE IF NOT EXISTS expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text not null,
  category text not null default 'Other',
  amount numeric not null default 0,
  currency text not null default 'GBP',
  notes text,
  status text default 'confirmed',
  created_at timestamptz default now()
);

-- Dedup tables for Gmail scanners
CREATE TABLE IF NOT EXISTS processed_expense_gmail_ids (
  message_id text primary key,
  processed_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS processed_invoice_gmail_ids (
  message_id text primary key,
  processed_at timestamptz default now()
);
