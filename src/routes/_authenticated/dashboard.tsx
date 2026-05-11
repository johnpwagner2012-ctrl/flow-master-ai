import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWorkflows, createWorkflow, type WorkflowRow } from "@/lib/workflow-api";
import { Button } from "@/components/ui/button";
import { Plus, Workflow as WorkflowIcon, Activity, Clock, CalendarClock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { listSchedulesWithWorkflows, type ScheduleRow } from "@/lib/schedules-api";
import { supabase } from "@/integrations/supabase/client";
import { describeCron } from "@/lib/cron-utils";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  type ScheduleWithWf = ScheduleRow & { workflow: { id: string; name: string; is_active: boolean } | null };
  const [schedules, setSchedules] = useState<ScheduleWithWf[]>([]);
  type RecentRun = { id: string; workflow_id: string; status: string; created_at: string; finished_at: string | null };
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);

  useEffect(() => {
    listWorkflows().then((d) => setWorkflows(d)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    listSchedulesWithWorkflows().then((d) => setSchedules(d as ScheduleWithWf[])).catch(() => {});
    supabase
      .from("workflow_runs")
      .select("id,workflow_id,status,created_at,finished_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setRecentRuns((data ?? []) as RecentRun[]));

    const ch = supabase
      .channel("dashboard-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_runs" }, () => {
        supabase
          .from("workflow_runs")
          .select("id,workflow_id,status,created_at,finished_at")
          .order("created_at", { ascending: false })
          .limit(8)
          .then(({ data }) => setRecentRuns((data ?? []) as RecentRun[]));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_schedules" }, () => {
        listSchedulesWithWorkflows().then((d) => setSchedules(d as ScheduleWithWf[])).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    { label: "Automations", value: schedules.filter((s) => s.enabled).length, icon: CalendarClock },
  ];

  const wfName = (id: string) => workflows.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const enabledSchedules = schedules.filter((s) => s.enabled);

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

      <section className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
        <div className="glass rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Active automations
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{enabledSchedules.length}</span>
          </div>
          {enabledSchedules.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No scheduled workflows yet.</div>
          ) : (
            <ul className="space-y-2">
              {enabledSchedules.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link to="/workflows/$id" params={{ id: s.workflow_id }}
                    className="flex items-center gap-3 rounded-lg border border-transparent bg-card/30 px-3 py-2 text-xs hover:border-border">
                    <CalendarClock className="h-3.5 w-3.5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.workflow?.name ?? "Workflow"}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{describeCron(s.cron_expression)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Next</div>
                      <div className="font-mono text-[11px]">
                        {s.next_run_at ? new Date(s.next_run_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "—"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" /> Recent runs
          </div>
          {recentRuns.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No runs yet.</div>
          ) : (
            <ul className="space-y-1.5">
              {recentRuns.map((r) => (
                <li key={r.id}>
                  <Link to="/workflows/$id" params={{ id: r.workflow_id }}
                    className="flex items-center gap-2 rounded-lg border border-transparent bg-card/30 px-3 py-2 text-xs hover:border-border">
                    {r.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      : r.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-destructive" />
                      : r.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="flex-1 truncate">{wfName(r.workflow_id)}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
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
