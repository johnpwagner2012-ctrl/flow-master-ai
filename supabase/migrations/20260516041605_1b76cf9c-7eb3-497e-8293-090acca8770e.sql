CREATE TABLE public.prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  system_prompt text,
  user_prompt text NOT NULL,
  default_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_preset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX prompt_templates_user_category_idx
  ON public.prompt_templates (user_id, category);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates owner select" ON public.prompt_templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Templates owner insert" ON public.prompt_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Templates owner update" ON public.prompt_templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Templates owner delete" ON public.prompt_templates
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER prompt_templates_touch_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();