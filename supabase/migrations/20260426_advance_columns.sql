-- Add typed columns to advance_requests so form submissions actually persist.
-- Existing code in /api/advance PUT upserts these fields by name, but the table
-- only had id/gig_id/notes/etc. Submissions were silently dropping the body.

ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS local_contact_name text,
  ADD COLUMN IF NOT EXISTS local_contact_phone text,
  ADD COLUMN IF NOT EXISTS local_contact_email text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_contact text,
  ADD COLUMN IF NOT EXISTS artist_liaison_name text,
  ADD COLUMN IF NOT EXISTS artist_liaison_contact text,
  ADD COLUMN IF NOT EXISTS videographer_name text,
  ADD COLUMN IF NOT EXISTS videographer_contact text,
  ADD COLUMN IF NOT EXISTS videographer_email text,
  ADD COLUMN IF NOT EXISTS sound_tech_name text,
  ADD COLUMN IF NOT EXISTS sound_tech_contact text,
  ADD COLUMN IF NOT EXISTS set_time text,
  ADD COLUMN IF NOT EXISTS running_order text,
  ADD COLUMN IF NOT EXISTS additional_notes text,
  -- Accommodation
  ADD COLUMN IF NOT EXISTS hotel_name text,
  ADD COLUMN IF NOT EXISTS hotel_address text,
  ADD COLUMN IF NOT EXISTS hotel_checkin_date date,
  ADD COLUMN IF NOT EXISTS hotel_checkin_time text,
  ADD COLUMN IF NOT EXISTS hotel_reference text,
  -- Transfer
  ADD COLUMN IF NOT EXISTS transfer_driver_name text,
  ADD COLUMN IF NOT EXISTS transfer_driver_phone text,
  ADD COLUMN IF NOT EXISTS transfer_pickup_location text,
  ADD COLUMN IF NOT EXISTS transfer_pickup_time text,
  -- Rider confirms
  ADD COLUMN IF NOT EXISTS tech_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hospo_confirmed boolean DEFAULT false,
  -- New: green room + guest list
  ADD COLUMN IF NOT EXISTS green_room text,
  ADD COLUMN IF NOT EXISTS guest_list_spots text,
  ADD COLUMN IF NOT EXISTS guest_list_method text;
