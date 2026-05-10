import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Loader2, History, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runWorkflow } from "@/lib/execution.functions";
import {
  listRuns,
  getNodeExecutions,
  getRunLogs,
  type WorkflowRunRow,
  type NodeExecutionRow,
  type ExecutionLogRow,
} from "@/lib/runs-api";
import type { WorkflowNodeData } from "./WorkflowNode";

type StatusMap = Record<string, WorkflowNodeData["status"]>;

function StatusIcon({ status }: { status: NodeExecutionRow["status"] | WorkflowRunRow["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function ExecutionPanel({
  workflowId,
  onStatusesChange,
}: {
  workflowId: string;
  onStatusesChange: (s: StatusMap) => void;
}) {
  const runFn = useServerFn(runWorkflow);
  const [starting, setStarting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRunRow | null>(null);
  const [nodeExecs, setNodeExecs] = useState<NodeExecutionRow[]>([]);
  const [logs, setLogs] = useState<ExecutionLogRow[]>([]);
  const [history, setHistory] = useState<WorkflowRunRow[]>([]);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const rows = await listRuns(workflowId);
      setHistory(rows);
    } catch (e) { console.error(e); }
  }, [workflowId]);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // When activeRunId changes, fetch initial data + subscribe to realtime
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    (async () => {
      const [execs, ls] = await Promise.all([getNodeExecutions(activeRunId), getRunLogs(activeRunId)]);
      if (cancelled) return;
      setNodeExecs(execs);
      setLogs(ls);
    })();

    const channel = supabase
      .channel(`run-${activeRunId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_runs", filter: `id=eq.${activeRunId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as WorkflowRunRow;
          setActiveRun(row);
          if (row.status === "success" || row.status === "failed") refreshHistory();
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "node_executions", filter: `workflow_run_id=eq.${activeRunId}` },
        (payload) => {
          const row = payload.new as NodeExecutionRow;
          setNodeExecs((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (idx === -1) return [...prev, row];
            const copy = prev.slice(); copy[idx] = row; return copy;
          });
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "execution_logs", filter: `workflow_run_id=eq.${activeRunId}` },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as ExecutionLogRow]);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeRunId, refreshHistory]);

  // Push node statuses up to canvas
  useEffect(() => {
    const map: StatusMap = {};
    for (const ne of nodeExecs) map[ne.node_key] = ne.status;
    onStatusesChange(map);
  }, [nodeExecs, onStatusesChange]);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  const onRun = async () => {
    setStarting(true);
    setNodeExecs([]); setLogs([]); setActiveRun(null);
    try {
      const result = await runFn({ data: { workflowId } });
      setActiveRunId(result.runId);
      toast.success("Workflow started");
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  };

  const isRunning = activeRun?.status === "running" || (activeRunId && !activeRun);

  const logsByNode = useMemo(() => {
    const m = new Map<string, ExecutionLogRow[]>();
    for (const l of logs) {
      const arr = m.get(l.node_execution_id) ?? [];
      arr.push(l); m.set(l.node_execution_id, arr);
    }
    return m;
  }, [logs]);

  return (
    <div className="glass flex w-[360px] flex-col rounded-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-medium">Execution</div>
        <Button size="sm" onClick={onRun} disabled={starting || !!isRunning}>
          {starting || isRunning ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
          Run
        </Button>
      </div>

      {activeRunId && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <StatusIcon status={activeRun?.status ?? "running"} />
            <span className="capitalize">{activeRun?.status ?? "running"}</span>
            <span className="text-muted-foreground ml-auto font-mono">{activeRunId.slice(0, 8)}</span>
          </div>
          {activeRun?.error_message && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {activeRun.error_message}
            </div>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="px-3 py-2">
          {nodeExecs.length === 0 && !activeRunId && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              Click <strong>Run</strong> to execute the workflow.
            </div>
          )}
          {nodeExecs.map((ne) => {
            const isOpen = expandedNode === ne.id;
            const nodeLogs = logsByNode.get(ne.id) ?? [];
            return (
              <div key={ne.id} className="mb-1.5 rounded-lg border border-border bg-card/30">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                  onClick={() => setExpandedNode(isOpen ? null : ne.id)}
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <StatusIcon status={ne.status} />
                  <span className="font-mono truncate flex-1">{ne.node_type}</span>
                  <span className="text-muted-foreground">{ne.node_key.slice(0, 8)}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-3 py-2 space-y-2 text-[11px]">
                    {nodeLogs.length > 0 && (
                      <div className="space-y-0.5">
                        {nodeLogs.map((l) => (
                          <div key={l.id} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-muted-foreground"}>
                            • {l.message}
                          </div>
                        ))}
                      </div>
                    )}
                    {ne.error_message && (
                      <div className="rounded bg-destructive/10 p-1.5 text-destructive">{ne.error_message}</div>
                    )}
                    {ne.output_data && (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Output</summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/30 p-2 font-mono text-[10px]">
                          {JSON.stringify(ne.output_data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-4 flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <History className="h-3 w-3" /> History
          </div>
          <div className="mt-1.5 space-y-1">
            {history.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveRunId(r.id)}
                className={`flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-border hover:bg-card/40 ${activeRunId === r.id ? "border-border bg-card/40" : ""}`}
              >
                <StatusIcon status={r.status} />
                <span className="capitalize flex-1">{r.status}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
              </button>
            ))}
            {history.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">No runs yet.</div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div ref={logRef} className="hidden" />
    </div>
  );
}