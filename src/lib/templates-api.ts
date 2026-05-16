import { supabase } from "@/integrations/supabase/client";

export type PromptTemplateRow = {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  system_prompt: string | null;
  user_prompt: string;
  default_model: string;
  variables: Record<string, unknown>;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_CATEGORIES = [
  "content_planner",
  "title_generator",
  "hook_generator",
  "caption_generator",
  "hashtag_generator",
  "general",
] as const;

export async function listTemplates(): Promise<PromptTemplateRow[]> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PromptTemplateRow[];
}

export async function upsertTemplate(input: {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  category: string;
  system_prompt?: string | null;
  user_prompt: string;
  default_model: string;
  variables?: Record<string, unknown>;
}): Promise<PromptTemplateRow> {
  const { data: userData } = await supabase.auth.getUser();
  const user_id = userData.user?.id;
  if (!user_id) throw new Error("Not authenticated");
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    user_id,
    slug: input.slug.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    category: input.category,
    system_prompt: input.system_prompt ?? null,
    user_prompt: input.user_prompt,
    default_model: input.default_model,
    variables: input.variables ?? {},
  };
  const { data, error } = await supabase
    .from("prompt_templates")
    .upsert(payload, { onConflict: "user_id,slug" })
    .select("*")
    .single();
  if (error) throw error;
  return data as PromptTemplateRow;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("prompt_templates").delete().eq("id", id);
  if (error) throw error;
}
