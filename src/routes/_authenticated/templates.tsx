import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import {
  listTemplates, upsertTemplate, deleteTemplate,
  TEMPLATE_CATEGORIES, type PromptTemplateRow,
} from "@/lib/templates-api";
import { DEFAULT_TEMPLATES } from "@/lib/prompt-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

type Draft = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  system_prompt: string;
  user_prompt: string;
  default_model: string;
};

const EMPTY: Draft = {
  slug: "", name: "", description: "", category: "title_generator",
  system_prompt: "", user_prompt: "", default_model: "google/gemini-2.5-flash",
};

function TemplatesPage() {
  const [items, setItems] = useState<PromptTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const refresh = () =>
    listTemplates().then(setItems).catch((e) => toast.error((e as Error).message));

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const edit = (row: PromptTemplateRow) => {
    setDraft({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      category: row.category,
      system_prompt: row.system_prompt ?? "",
      user_prompt: row.user_prompt,
      default_model: row.default_model,
    });
  };

  const loadDefault = () => {
    const d = DEFAULT_TEMPLATES[draft.category];
    if (!d) return toast.error("No built-in default for this category");
    setDraft((prev) => ({
      ...prev,
      system_prompt: d.system_prompt ?? "",
      user_prompt: d.user_prompt,
      default_model: d.default_model,
    }));
  };

  const save = async () => {
    if (!draft.slug.trim() || !draft.name.trim() || !draft.user_prompt.trim()) {
      toast.error("Slug, name, and user prompt are required");
      return;
    }
    setSaving(true);
    try {
      await upsertTemplate({
        id: draft.id,
        slug: draft.slug,
        name: draft.name,
        description: draft.description || null,
        category: draft.category,
        system_prompt: draft.system_prompt || null,
        user_prompt: draft.user_prompt,
        default_model: draft.default_model,
      });
      toast.success("Template saved");
      setDraft(EMPTY);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try { await deleteTemplate(id); toast.success("Deleted"); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Prompt templates</h1>
          <p className="text-xs text-muted-foreground">
            Reusable AI presets referenced by content nodes via <code>slug</code>.
            Variables like <code>{`{{source}}`}</code>, <code>{`{{count}}`}</code>,
            <code>{`{{platform}}`}</code>, <code>{`{{niche}}`}</code>, <code>{`{{extra_instructions}}`}</code> are injected at run time.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setDraft(EMPTY)}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </header>

      <section className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="glass rounded-xl">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">Your templates</div>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No custom templates yet. Built-in defaults are used automatically when a node's
              <code> template_slug</code> is empty.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => edit(row)} className="truncate text-sm font-medium hover:text-gradient">
                        {row.name}
                      </button>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{row.slug}</code>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {row.category} · {row.default_model}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(row.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">{draft.id ? "Edit template" : "New template"}</div>
            <Button size="sm" variant="ghost" onClick={loadDefault} type="button">
              Load built-in default
            </Button>
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Slug</Label>
                <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  placeholder="my-titles-v2" />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default model</Label>
                <Select value={draft.default_model} onValueChange={(v) => setDraft({ ...draft, default_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">System prompt</Label>
              <Textarea rows={3} value={draft.system_prompt}
                onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
                placeholder="You are a senior short-form content strategist…" />
            </div>
            <div>
              <Label className="text-xs">User prompt</Label>
              <Textarea rows={8} value={draft.user_prompt}
                onChange={(e) => setDraft({ ...draft, user_prompt: e.target.value })}
                placeholder={"Topic / context:\n{{source}}\n\nWrite {{count}} ideas. Return JSON array."} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Supports <code>{`{{source}}`}</code>, <code>{`{{count}}`}</code>,
                <code>{`{{platform}}`}</code>, <code>{`{{niche}}`}</code>,
                <code>{`{{extra_instructions}}`}</code>, and any upstream node key like
                <code>{`{{ai_script.text}}`}</code>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDraft(EMPTY)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}
                className="bg-[image:var(--gradient-primary)] text-primary-foreground hover:opacity-90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save template
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
