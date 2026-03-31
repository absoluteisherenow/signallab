-- Run this once in Supabase Studio → SQL Editor

-- 1. Travel bookings table
CREATE TABLE IF NOT EXISTS travel_bookings (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references gigs(id) on delete set null,
  type text not null, -- 'flight' | 'train' | 'hotel'
  name text,
  flight_number text,
  from_location text,
  to_location text,
  departure_at timestamptz,
  arrival_at timestamptz,
  check_in date,
  check_out date,
  reference text,
  cost numeric,
  currency text default 'EUR',
  notes text,
  source text default 'manual',
  created_at timestamptz default now()
);

-- 2. Contact fields on gigs
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS promoter_phone text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS al_name text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS al_phone text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS al_email text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS driver_phone text;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS driver_notes text;
