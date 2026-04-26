-- ── Multi-tenancy batch 3 ───────────────────────────────────────────────────
-- Adds user_id + RLS to the remaining single-tenant tables found during the
-- pre-launch audit. Backfills existing rows to Anthony's user_id so we don't
-- orphan production data.
--
-- Tables: tasks, revenue_streams, documents, content_strategies, dj_tracks

DO $$
DECLARE
  anthony uuid := '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767';
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tasks','revenue_streams','documents','content_strategies','dj_tracks']) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE user_id IS NULL', t) USING anthony;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)', t || '_user_id_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS user_owns_row_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS user_owns_row_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS user_owns_row_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS user_owns_row_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY user_owns_row_select ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY user_owns_row_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY user_owns_row_update ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY user_owns_row_delete ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;
