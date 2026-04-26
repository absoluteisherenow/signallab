-- Subscriptions table — one row per user, populated by Stripe webhook on
-- checkout.session.completed and customer.subscription.* events.
--
-- Insert/Update policies omitted by design — only the Stripe webhook (running
-- as service-role) writes here. Frontend reads via user_owns_row_select to
-- show the user's current tier in PricingGrid + Settings.
--
-- Applied live via Supabase Management API on 2026-04-24.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  tier text not null default 'free' check (tier in ('free','creator','artist','pro','management')),
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx ON public.subscriptions(stripe_customer_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.subscriptions;
CREATE POLICY user_owns_row_select ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
