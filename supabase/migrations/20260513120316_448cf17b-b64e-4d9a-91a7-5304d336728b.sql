-- 1. Extend pending_client_jobs with locking + lifecycle fields
ALTER TABLE public.pending_client_jobs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS pending_client_jobs_pickable_idx
  ON public.pending_client_jobs (user_id, status, lease_until);

-- 2. Atomic claim function (per-user, skip-locked)
CREATE OR REPLACE FUNCTION public.claim_client_job(
  _user_id uuid,
  _worker_id text,
  _lease_seconds integer DEFAULT 120,
  _types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  workflow_id uuid,
  workflow_run_id uuid,
  node_execution_id uuid,
  node_key text,
  node_type text,
  payload jsonb,
  attempts integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _picked uuid;
BEGIN
  SELECT j.id INTO _picked
  FROM public.pending_client_jobs j
  WHERE j.user_id = _user_id
    AND (j.status = 'pending' OR (j.status = 'claimed' AND j.lease_until < now()))
    AND j.attempts < j.max_attempts
    AND (_types IS NULL OR j.node_type = ANY(_types))
  ORDER BY j.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _picked IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.pending_client_jobs j
     SET status = 'claimed',
         claimed_by = _worker_id,
         claimed_at = now(),
         lease_until = now() + make_interval(secs => _lease_seconds),
         heartbeat_at = now(),
         attempts = j.attempts + 1
   WHERE j.id = _picked;

  RETURN QUERY
  SELECT j.id, j.workflow_id, j.workflow_run_id, j.node_execution_id,
         j.node_key, j.node_type, j.payload, j.attempts, j.max_attempts
  FROM public.pending_client_jobs j
  WHERE j.id = _picked;
END;
$$;

-- 3. Stale lease reclaimer (idempotent)
CREATE OR REPLACE FUNCTION public.release_stale_client_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  WITH released AS (
    UPDATE public.pending_client_jobs
       SET status = 'pending',
           claimed_by = NULL,
           claimed_at = NULL,
           lease_until = NULL,
           heartbeat_at = NULL
     WHERE status = 'claimed'
       AND lease_until < now()
       AND attempts < max_attempts
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM released;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_client_job(uuid, text, integer, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_client_jobs() TO authenticated;