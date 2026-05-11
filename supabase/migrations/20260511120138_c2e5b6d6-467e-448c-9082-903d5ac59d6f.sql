CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_run_id UUID,
  node_execution_id UUID,
  workflow_id UUID,
  node_key TEXT,
  type TEXT NOT NULL DEFAULT 'script',
  name TEXT,
  content TEXT,
  file_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assets_user ON public.assets(user_id, created_at DESC);
CREATE INDEX idx_assets_run ON public.assets(workflow_run_id);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets owner select" ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Assets owner insert" ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Assets owner update" ON public.assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Assets owner delete" ON public.assets FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;