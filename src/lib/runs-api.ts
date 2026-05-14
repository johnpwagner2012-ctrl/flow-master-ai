import { supabase } from "@/integrations/supabase/client";

export type WorkflowRunRow = {
  id: string;
  workflow_id: string;
  user_id: string;
  status: "queued" | "running" | "success" | "failed";
  trigger_data: Record<string, unknown>;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type NodeExecutionRow = {
  id: string;
  workflow_run_id: string;
  user_id: string;
  node_key: string;
  node_type: string;
  status: "pending" | "running" | "success" | "failed";
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  progress_pct?: number | null;
  progress_message?: string | null;
};

export type ExecutionLogRow = {
  id: string;
  workflow_run_id: string;
  node_execution_id: string;
  level: string;
  message: string;
  created_at: string;
};

export async function listRuns(workflowId: string, limit = 25): Promise<WorkflowRunRow[]> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WorkflowRunRow[];
}

export async function getNodeExecutions(runId: string): Promise<NodeExecutionRow[]> {
  const { data, error } = await supabase
    .from("node_executions")
    .select("*")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NodeExecutionRow[];
}

export async function getRunLogs(runId: string): Promise<ExecutionLogRow[]> {
  const { data, error } = await supabase
    .from("execution_logs")
    .select("*")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExecutionLogRow[];
}