-- Saved content strategy suggestions from Signal Voice and generated plans
CREATE TABLE IF NOT EXISTS content_strategies (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'signal_voice',  -- 'signal_voice' | 'generated'
  query text,                                     -- original user query (if from Signal Voice)
  answer text,                                    -- AI overview/answer
  phases jsonb,                                   -- [{name, timing, actions[]}]
  always_on jsonb,                                -- ["always on" content suggestions]
  created_at timestamptz default now()
);
