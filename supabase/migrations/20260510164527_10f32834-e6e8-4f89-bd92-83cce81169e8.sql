
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles are updatable by owner" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles are insertable by owner" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Workflows
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled workflow',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflows_user ON public.workflows(user_id);
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workflows owner select" ON public.workflows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Workflows owner insert" ON public.workflows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Workflows owner update" ON public.workflows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Workflows owner delete" ON public.workflows FOR DELETE USING (auth.uid() = user_id);

-- Workflow nodes
CREATE TABLE public.workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  node_key TEXT NOT NULL, -- React Flow node id (string)
  type TEXT NOT NULL,     -- node kind, e.g. 'http_request', 'cron_trigger'
  label TEXT,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, node_key)
);
CREATE INDEX idx_nodes_workflow ON public.workflow_nodes(workflow_id);
ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nodes owner select" ON public.workflow_nodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Nodes owner insert" ON public.workflow_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Nodes owner update" ON public.workflow_nodes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Nodes owner delete" ON public.workflow_nodes FOR DELETE USING (auth.uid() = user_id);

-- Workflow edges
CREATE TABLE public.workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  edge_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  source_handle TEXT,
  target_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, edge_key)
);
CREATE INDEX idx_edges_workflow ON public.workflow_edges(workflow_id);
ALTER TABLE public.workflow_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Edges owner select" ON public.workflow_edges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Edges owner insert" ON public.workflow_edges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Edges owner update" ON public.workflow_edges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Edges owner delete" ON public.workflow_edges FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_workflows_touch BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_nodes_touch BEFORE UPDATE ON public.workflow_nodes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
