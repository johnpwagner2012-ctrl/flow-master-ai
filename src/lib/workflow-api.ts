import { supabase } from "@/integrations/supabase/client";
import type { NodeKind } from "./node-registry";

export type WorkflowRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  viewport: { x: number; y: number; zoom: number };
  created_at: string;
  updated_at: string;
};

export type NodeRow = {
  id: string;
  workflow_id: string;
  user_id: string;
  node_key: string;
  type: NodeKind;
  label: string | null;
  position_x: number;
  position_y: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EdgeRow = {
  id: string;
  workflow_id: string;
  user_id: string;
  edge_key: string;
  source_key: string;
  target_key: string;
  source_handle: string | null;
  target_handle: string | null;
  created_at: string;
};

export async function listWorkflows() {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as WorkflowRow[];
}

export async function createWorkflow(name = "Untitled workflow") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("workflows")
    .insert({ name, user_id: user.id })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkflowRow;
}

export async function getWorkflow(id: string) {
  const [{ data: wf, error: wfErr }, { data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from("workflows").select("*").eq("id", id).single(),
    supabase.from("workflow_nodes").select("*").eq("workflow_id", id),
    supabase.from("workflow_edges").select("*").eq("workflow_id", id),
  ]);
  if (wfErr) throw wfErr;
  if (nErr) throw nErr;
  if (eErr) throw eErr;
  return { workflow: wf as WorkflowRow, nodes: (nodes ?? []) as NodeRow[], edges: (edges ?? []) as EdgeRow[] };
}

export async function deleteWorkflow(id: string) {
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw error;
}

export async function updateWorkflowMeta(id: string, patch: Partial<Pick<WorkflowRow, "name" | "description" | "is_active" | "viewport">>) {
  const { error } = await supabase.from("workflows").update(patch).eq("id", id);
  if (error) throw error;
}

/** Replace-style sync: upsert all nodes/edges currently in the canvas, delete those removed. */
export async function syncCanvas(params: {
  workflowId: string;
  nodes: { node_key: string; type: NodeKind; label: string | null; position_x: number; position_y: number; config: Record<string, unknown> }[];
  edges: { edge_key: string; source_key: string; target_key: string; source_handle: string | null; target_handle: string | null }[];
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { workflowId } = params;

  // Upsert nodes
  const nodeRows = params.nodes.map(n => ({ ...n, workflow_id: workflowId, user_id: user.id }));
  if (nodeRows.length > 0) {
    const { error } = await supabase
      .from("workflow_nodes")
      .upsert(nodeRows, { onConflict: "workflow_id,node_key" });
    if (error) throw error;
  }
  // Delete removed nodes
  const keepNodeKeys = new Set(params.nodes.map(n => n.node_key));
  {
    const { data: existing, error } = await supabase
      .from("workflow_nodes").select("id,node_key").eq("workflow_id", workflowId);
    if (error) throw error;
    const toDelete = (existing ?? []).filter(r => !keepNodeKeys.has(r.node_key)).map(r => r.id);
    if (toDelete.length) {
      const { error: delErr } = await supabase.from("workflow_nodes").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }
  }

  // Upsert edges
  const edgeRows = params.edges.map(e => ({ ...e, workflow_id: workflowId, user_id: user.id }));
  if (edgeRows.length > 0) {
    const { error } = await supabase
      .from("workflow_edges")
      .upsert(edgeRows, { onConflict: "workflow_id,edge_key" });
    if (error) throw error;
  }
  const keepEdgeKeys = new Set(params.edges.map(e => e.edge_key));
  {
    const { data: existing, error } = await supabase
      .from("workflow_edges").select("id,edge_key").eq("workflow_id", workflowId);
    if (error) throw error;
    const toDelete = (existing ?? []).filter(r => !keepEdgeKeys.has(r.edge_key)).map(r => r.id);
    if (toDelete.length) {
      const { error: delErr } = await supabase.from("workflow_edges").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }
  }

  await supabase.from("workflows").update({ updated_at: new Date().toISOString() }).eq("id", workflowId);
}
