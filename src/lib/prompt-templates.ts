import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PromptTemplate = {
  slug: string;
  name: string;
  category: string;
  system_prompt: string | null;
  user_prompt: string;
  default_model: string;
  variables?: Record<string, unknown>;
};

/** Built-in defaults used when a node has no template_slug or the slug is not found. */
export const DEFAULT_TEMPLATES: Record<string, PromptTemplate> = {
  content_planner: {
    slug: "default",
    name: "Default content plan",
    category: "content_planner",
    system_prompt:
      "You are a senior short-form content strategist. Produce concise, structured, JSON-only plans optimised for vertical video.",
    user_prompt:
      "Niche/brand voice: {{niche}}\nTrends / source material:\n{{source}}\n\n" +
      "Produce {{count}} content ideas. Return ONLY a JSON array, each item: " +
      `{"topic": string, "angle": string, "audience": string, "key_points": string[]}.\n` +
      "{{extra_instructions}}",
    default_model: "google/gemini-2.5-flash",
  },
  title_generator: {
    slug: "default",
    name: "Default title generator",
    category: "title_generator",
    system_prompt:
      "You write scroll-stopping short-form video titles. No hashtags, no emojis unless asked. Max 80 chars.",
    user_prompt:
      "Platform: {{platform}}\nTopic / context:\n{{source}}\n\n" +
      "Write {{count}} distinct, high-CTR titles. Return ONLY a JSON array of strings.\n{{extra_instructions}}",
    default_model: "google/gemini-2.5-flash",
  },
  hook_generator: {
    slug: "default",
    name: "Default hook generator",
    category: "hook_generator",
    system_prompt:
      "You write 1–3 second opening hooks for vertical video. Short, punchy, pattern-interrupting, conversational. Max 15 words each.",
    user_prompt:
      "Topic / context:\n{{source}}\n\n" +
      "Write {{count}} opening hooks. Return ONLY a JSON array of strings.\n{{extra_instructions}}",
    default_model: "google/gemini-2.5-flash",
  },
  caption_generator: {
    slug: "default",
    name: "Default caption generator",
    category: "caption_generator",
    system_prompt:
      "You write platform-native short-form post captions. Conversational, tight, with one clear CTA. No hashtags in the caption body.",
    user_prompt:
      "Platform: {{platform}}\nTopic / script:\n{{source}}\n\n" +
      "Write one optimised caption. Return ONLY the caption text (no quotes, no JSON).\n{{extra_instructions}}",
    default_model: "google/gemini-2.5-flash",
  },
  hashtag_generator: {
    slug: "default",
    name: "Default hashtag generator",
    category: "hashtag_generator",
    system_prompt:
      "You generate relevant, mixed-volume hashtag sets for short-form video. No spaces, no punctuation other than #.",
    user_prompt:
      "Topic / caption:\n{{source}}\n\n" +
      "Return ONLY a JSON array of {{count}} hashtag strings, each starting with #.",
    default_model: "google/gemini-2.5-flash",
  },
};

export function interpolatePrompt(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_, path: string) => {
    const parts = path.split(".");
    let cur: unknown = vars;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else return "";
    }
    if (cur == null) return "";
    return typeof cur === "string" ? cur : JSON.stringify(cur);
  });
}

/** Resolve a template by slug for the given category. Falls back to built-in default. */
export async function resolveTemplate(
  sb: SupabaseClient<Database>,
  userId: string,
  category: string,
  slug: string | null | undefined,
): Promise<PromptTemplate> {
  const fallback = DEFAULT_TEMPLATES[category];
  const trimmed = (slug ?? "").trim();
  if (!trimmed || trimmed === "default") {
    if (!fallback) throw new Error(`No default template for category "${category}"`);
    return fallback;
  }
  const { data, error } = await sb
    .from("prompt_templates")
    .select("slug,name,category,system_prompt,user_prompt,default_model,variables")
    .eq("user_id", userId)
    .eq("slug", trimmed)
    .maybeSingle();
  if (error) throw new Error(`Template lookup failed: ${error.message}`);
  if (!data) {
    if (!fallback) throw new Error(`Template "${trimmed}" not found and no default for "${category}"`);
    return fallback;
  }
  return {
    slug: data.slug,
    name: data.name,
    category: data.category,
    system_prompt: data.system_prompt,
    user_prompt: data.user_prompt,
    default_model: data.default_model,
    variables: (data.variables ?? {}) as Record<string, unknown>,
  };
}

/** Extract a JSON array of strings (or objects) from an LLM response. Robust to ```json fences. */
export function parseJsonArray(text: string): unknown[] {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fence ? fence[1] : text).trim();
  // Try strict parse first
  try {
    const v = JSON.parse(body);
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray((v as { items?: unknown[] }).items)) {
      return (v as { items: unknown[] }).items;
    }
  } catch {
    // fall through
  }
  // Find the first [...] block
  const m = body.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      if (Array.isArray(v)) return v;
    } catch {
      // ignore
    }
  }
  // Fall back to line splitting (strip bullets/numbers)
  return body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

/** Best-effort summarisation of upstream node outputs into a text block usable as {{source}}. */
export function summariseUpstream(inputs: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, v] of Object.entries(inputs)) {
    if (v == null) continue;
    if (typeof v === "string") { parts.push(`# ${key}\n${v}`); continue; }
    if (typeof v === "object") {
      const rec = v as Record<string, unknown>;
      // Trend fetcher shape
      if (Array.isArray(rec.trends)) {
        const lines = (rec.trends as Array<Record<string, unknown>>).slice(0, 25).map(
          (t) => `- [${t.subreddit ?? ""}] ${t.title ?? ""} (score=${t.score ?? 0})`,
        );
        parts.push(`# ${key} (trends)\n${lines.join("\n")}`);
        continue;
      }
      // Content planner shape
      if (Array.isArray(rec.plan)) {
        parts.push(`# ${key} (plan)\n${JSON.stringify(rec.plan, null, 2).slice(0, 4000)}`);
        continue;
      }
      // Generic text fields
      const text = (rec.text ?? rec.content ?? rec.caption ?? rec.body ?? rec.title) as unknown;
      if (typeof text === "string") { parts.push(`# ${key}\n${text}`); continue; }
      // List of strings
      if (Array.isArray(rec.items)) {
        parts.push(`# ${key}\n${(rec.items as unknown[]).join("\n")}`);
        continue;
      }
      parts.push(`# ${key}\n${JSON.stringify(rec).slice(0, 2000)}`);
    }
  }
  return parts.join("\n\n").slice(0, 12000);
}
