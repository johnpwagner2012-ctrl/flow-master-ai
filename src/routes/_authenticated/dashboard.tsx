import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWorkflows, createWorkflow, type WorkflowRow } from "@/lib/workflow-api";
import { Button } from "@/components/ui/button";
import { Plus, Workflow as WorkflowIcon, Activity, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    listWorkflows().then((d) => setWorkflows(d)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  const onCreate = async () => {
    try {
      const wf = await createWorkflow();
      navigate({ to: "/workflows/$id", params: { id: wf.id } });
    } catch (e) { toast.error((e as Error).message); }
  };

  const stats = [
    { label: "Total workflows", value: workflows.length, icon: WorkflowIcon },
    { label: "Active", value: workflows.filter((w) => w.is_active).length, icon: Activity },
    { label: "Last edited", value: workflows[0] ? new Date(workflows[0].updated_at).toLocaleDateString() : "—", icon: Clock },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Overview of your automations</p>
        </div>
        <Button onClick={onCreate} className="bg-[image:var(--gradient-primary)] text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </header>

      <section className="grid gap-4 p-6 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">{s.value}</div>
          </div>
        ))}
      </section>

      <section className="px-6 pb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent workflows</h2>
          <Link to="/workflows" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {loading ? (
          <div className="glass h-40 animate-pulse rounded-xl" />
        ) : workflows.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-sm text-muted-foreground">No workflows yet. Create your first automation.</p>
            <Button onClick={onCreate} className="mt-4 bg-[image:var(--gradient-primary)] text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> New workflow
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workflows.slice(0, 6).map((w) => (
              <Link key={w.id} to="/workflows/$id" params={{ id: w.id }} className="glass group rounded-xl p-5 transition hover:glow-ring">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {w.is_active ? "active" : "draft"}
                  </span>
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="mt-3 truncate text-base font-medium group-hover:text-gradient">{w.name}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{w.description ?? "No description"}</div>
                <div className="mt-4 text-[10px] text-muted-foreground">Updated {new Date(w.updated_at).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
