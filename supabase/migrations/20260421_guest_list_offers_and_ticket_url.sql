-- Guest-list offer flags + per-gig ticket URL
ALTER TABLE guest_list_invites
  ADD COLUMN IF NOT EXISTS offers_discount boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS offers_guestlist boolean NOT NULL DEFAULT true;

ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS ticket_url text;
