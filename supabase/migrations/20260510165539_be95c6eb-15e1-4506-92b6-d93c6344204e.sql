
-- workflow_runs
CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  trigger_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_data jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_runs_workflow_id_idx ON public.workflow_runs (workflow_id, created_at DESC);
CREATE INDEX workflow_runs_user_id_idx ON public.workflow_runs (user_id, created_at DESC);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Runs owner select" ON public.workflow_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Runs owner insert" ON public.workflow_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Runs owner update" ON public.workflow_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Runs owner delete" ON public.workflow_runs FOR DELETE USING (auth.uid() = user_id);

-- node_executions
CREATE TABLE public.node_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  node_key text NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input_data jsonb,
  output_data jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX node_executions_run_idx ON public.node_executions (workflow_run_id);
CREATE INDEX node_executions_user_idx ON public.node_executions (user_id);

ALTER TABLE public.node_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Node exec owner select" ON public.node_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Node exec owner insert" ON public.node_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Node exec owner update" ON public.node_executions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Node exec owner delete" ON public.node_executions FOR DELETE USING (auth.uid() = user_id);

-- execution_logs
CREATE TABLE public.execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_execution_id uuid NOT NULL REFERENCES public.node_executions(id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX execution_logs_run_idx ON public.execution_logs (workflow_run_id, created_at);
CREATE INDEX execution_logs_node_idx ON public.execution_logs (node_execution_id, created_at);

ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Logs owner select" ON public.execution_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Logs owner insert" ON public.execution_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Logs owner delete" ON public.execution_logs FOR DELETE USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.workflow_runs REPLICA IDENTITY FULL;
ALTER TABLE public.node_executions REPLICA IDENTITY FULL;
ALTER TABLE public.execution_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.node_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.execution_logs;
