DROP FUNCTION IF EXISTS public.claim_client_job(uuid, text, integer, text[]);

CREATE OR REPLACE FUNCTION public.claim_client_job(
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
  _uid uuid := auth.uid();
  _picked uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT j.id INTO _picked
  FROM public.pending_client_jobs j
  WHERE j.user_id = _uid
    AND (j.status = 'pending' OR (j.status = 'claimed' AND j.lease_until < now()))
    AND j.attempts < j.max_attempts
    AND (_types IS NULL OR j.node_type = ANY(_types))
  ORDER BY j.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _picked IS NULL THEN RETURN; END IF;

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

CREATE OR REPLACE FUNCTION public.release_stale_client_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  WITH released AS (
    UPDATE public.pending_client_jobs
       SET status = 'pending',
           claimed_by = NULL,
           claimed_at = NULL,
           lease_until = NULL,
           heartbeat_at = NULL
     WHERE user_id = _uid
       AND status = 'claimed'
       AND lease_until < now()
       AND attempts < max_attempts
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM released;
  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_client_job(text, integer, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_stale_client_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_client_job(text, integer, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_client_jobs() TO authenticated;