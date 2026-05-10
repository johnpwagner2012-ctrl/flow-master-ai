import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWorkflows, createWorkflow, deleteWorkflow, type WorkflowRow } from "@/lib/workflow-api";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workflows/")({ component: WorkflowsPage });

function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = () => listWorkflows().then(setWorkflows).catch((e) => toast.error(e.message));

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const onCreate = async () => {
    try {
      const wf = await createWorkflow();
      navigate({ to: "/workflows/$id", params: { id: wf.id } });
    } catch (e) { toast.error((e as Error).message); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    try { await deleteWorkflow(id); await refresh(); toast.success("Workflow deleted"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-xs text-muted-foreground">All your automations in one place</p>
        </div>
        <Button onClick={onCreate} className="bg-[image:var(--gradient-primary)] text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </header>
      <section className="p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : workflows.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-sm text-muted-foreground">No workflows yet.</p>
          </div>
        ) : (
          <div className="glass divide-y divide-border overflow-hidden rounded-xl">
            {workflows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-card/40">
                <div className="min-w-0 flex-1">
                  <Link to="/workflows/$id" params={{ id: w.id }} className="truncate text-sm font-medium hover:text-gradient">
                    {w.name}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{w.description ?? "No description"}</div>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {w.is_active ? "active" : "draft"}
                </div>
                <div className="hidden text-xs text-muted-foreground md:block">{new Date(w.updated_at).toLocaleString()}</div>
                <div className="flex items-center gap-1">
                  <Link to="/workflows/$id" params={{ id: w.id }}>
                    <Button size="icon" variant="ghost" title="Open"><ExternalLink className="h-4 w-4" /></Button>
                  </Link>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(w.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
