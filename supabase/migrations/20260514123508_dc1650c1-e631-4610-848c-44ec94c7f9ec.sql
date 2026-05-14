ALTER TABLE public.node_executions
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message TEXT;